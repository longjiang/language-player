# ADR-0043 — Serve textbook media from the existing shared host behind `ASSET_BASE_URL`

**Status:** Accepted (2026-09-11)

## Context

SPEC-095 (interactive textbook) requires two classes of binary media that the app has never served before:

- **Images** — map graphics, photo sets, tables, and app screenshots extracted from a workbook PDF.
- **Audio** — task audio tracks (the pilot unit alone has 47 mp3 files).

The scale rule that out immediately as repository content: the pilot unit is ~29 MB (a 3.5 MB workbook PDF, 47 mp3s, plus answer-key and transcript PDFs), a book is roughly six units, and this platform expects many books and several exam levels. `apps/web/public/` is currently 468 KB of tracked assets and every file in `apps/mobile/assets/` is `require()`d into the Metro bundle and the store binary, so bundling media would inflate both the repo and the app download.

No media hosting exists in this project today, and this was verified rather than assumed:

- **No CDN, object store, or asset host of any kind.** There is no S3/R2/Spaces/Bunny/Cloudinary/UploadThing client, and no `boto3`.
- **No Supabase Storage.** ADR-0021 migrated database *rows*; the repo's `supabase/migrations/` contains only RLS / identity-shadow / default-privilege migrations (445 lines across 4 files) and never creates a bucket. Supabase is used for Auth (ADR-0023) and data, not files.
- **No asset base-URL helper.** `apps/web/src/lib/api-url.ts` and `apps/mobile/lib/api-url.ts` each export exactly one symbol, `PYTHON_API_URL`.
- **No cache policy for static assets.** `netlify.toml` has zero `[[headers]]` blocks, so anything served from the web origin inherits Next/Netlify defaults with no `Cache-Control` control.
- Flask serves essentially no media: the only image route is `GET /channel-thumbnail` (ADR-0036, backed by a 138 MB disk cache of channel avatars). There are **zero audio routes** among the backend's routes, and no upload endpoint anywhere.

What *does* exist and is already in production is a **PHP shared host** used for exactly this purpose:

- `zerotohero-nuxt/lib/utils/servers.js:38–39` defines `IMAGE_URL = https://server.chinesezerotohero.com/data/word-images/` and `ANIMATED_SVG_URL = .../data/char-stroke-svgs/`, with an `image.php` CORS `*` proxy and disk cache alongside.
- `zerotohero-python-server/remote_cache.py` implements a **two-tier cache** over the same host — local disk first, then shared-host `load-flask-cache.php` / `save-flask-cache.php` / `load-flask-cache-batch.php`, authed by an `X-Cache-Key` header, with `offload_cache.py --max-age-days 30` moving cold files up and `prune_cache.py` managing growth.

So the project already runs a working keys-and-files asset host. The decision is whether to use it or stand up new infrastructure.

## Decision

**Serve textbook media from the existing PHP shared host, addressed through a single `ASSET_BASE_URL` constant in each app.** No new object store or CDN is introduced.

1. **One constant per app, mirroring `PYTHON_API_URL`.** Add `apps/web/src/lib/asset-url.ts` and the mobile equivalent exporting `ASSET_BASE_URL`, read from `NEXT_PUBLIC_ASSET_URL` / `EXPO_PUBLIC_ASSET_URL` with a production default of the shared host and a local-dev override. Content code never constructs a host itself.
2. **Content stores relative keys, never URLs.** A task references `u06/B/t2.mp3`, not an absolute URL. The client resolves `key` → `ASSET_BASE_URL + key` through one shared resolver in `packages/textbooks`, which also owns any URL escaping.
3. **Content-addressed, immutable filenames.** Media is uploaded under a name containing a content hash (e.g. `t2.<hash>.mp3`), so a file's bytes can never change under a fixed URL. That makes long-lived immutable caching safe and lets re-authored content coexist with cached clients.
4. **Publish through a one-shot `offload`-style step, not by hand.** An authoring script uploads a unit's media to the host and writes an asset manifest the validator checks against (SPEC-095 requires that every referenced key exists).
5. **Do not bundle textbook media into the mobile binary.** Adding each image to `apps/mobile/lib/reader-assets.ts`'s `BUNDLED_IMAGES` map (currently one entry) does not scale; mobile fetches from `ASSET_BASE_URL` and caches locally, the way EPUB and dictionary downloads already do.

Because (1) and (2) hold, migrating to a real CDN or object store later is a **one-constant change plus a re-upload** — no content edits and no client code changes.

## Consequences

- **Zero new infrastructure.** The host, its CORS image proxy, and the offload cache pattern are already in production and already trusted by the backend.
- **The repo stays small** and the mobile bundle does not grow with content, so adding units does not affect app download size or store review.
- **Assets are switchable.** The relative-key + single-constant indirection is what makes a future CDN migration cheap; this is the main reason to accept the trade-offs below.
- **Content is not self-contained in git**, so content and its media must be published together. A unit directory and its uploaded manifest are one unit of release; the validator's asset check is what enforces this.
- **Shared-hosting capacity and reliability become a product dependency**, with no CDN edge caching and no SLA. Cold-start latency for a first playback is therefore on the shared host, and uncached media on a slow connection is the expected worst case.
- **The shared host is not a first-party deployment**, so its availability is a risk the textbook feature shares with the existing dictionary image and stroke-order features.
- **No upload API is created by this decision**; publishing is an operator/authoring-script action, consistent with how dictionary and stroke assets already get there.
- **`ASSET_BASE_URL` joins `PYTHON_API_URL` as a required environment constant**, and must be documented in the deployment runbook (`docs/arch/029-production-deployment-runbook.md`) so a production build does not silently fall back to a local path.
- If textbook media ever needs per-user access control or signed URLs, this decision must be revisited — a public shared host cannot express either.

## Alternatives Considered

- **Supabase Storage (new bucket).** Aligns with the in-flight Supabase migration and would offer a real object store, but no Storage is in use anywhere today and ADR-0021 scoped Supabase to database rows. Introducing a first-of-its-kind bucket, its RLS policies, and a new upload path mid-migration is materially more work and more risk than reusing a host that already serves images.
- **Serve from `apps/web/public/`.** Simplest possible path, but it commits megabytes to git, couples every new unit to a Netlify deploy, has no `Cache-Control` policy (zero `[[headers]]` blocks in `netlify.toml`), and does nothing for mobile.
- **Bundle media into the apps.** Smallest latency and fully offline, but grows the mobile binary and the repo per unit and per book, which is the outcome this decision exists to avoid.
- **Stand up a CDN/S3-compatible bucket now.** Best long-term capacity and caching, but it is new infrastructure needing its own credentials, upload tooling, and an operational runbook — unjustified before a second book exists. The relative-key indirection keeps this option open at low cost.
