# SPEC-096: Admin Video Ingestion (YouTube id / channel / playlist → DB)

## Metadata

- **Spec ID**: SPEC-096
- **Feature**: Admin endpoints that add YouTube videos to `youtube_videos` —
  a single video, a list of ids, a whole channel, or a whole playlist — by
  fetching metadata, downloading the L2 transcript, populating the
  lemmatization cache and scoring difficulty
- **Status**: complete (2026-10-16); extended 2026-10-19 with the read-only
  discovery and transcript-check phases
- **Created**: 2026-10-16
- **Implemented**: 2026-10-16 — five commits, `ec70774` → `1df1911`
  (`zerotohero-python-server`). 2026-10-19 — `7f6025e` added
  `/admin/videos/ids`, `/admin/videos/screen` and `utils_video_screening.py`;
  the later `7794ed8` / `00756f7` commits added manual-only eligibility,
  throttling and `/admin/videos/transcripts` for the console's three-phase
  import (SPEC-099).
- **ROADMAP Phase**: Phase 9: Backend Consolidation
- **Scope**: Flask backend (`zerotohero-python-server/`). The admin console UI
  that calls these endpoints is [SPEC-099](099-admin-content-management.md).
- **See also**:
  - [ARCH-032 — YouTube Video Difficulty](../arch/032-youtube-video-difficulty.md) — how `lex_div` / `word_freq` / `difficulty` are defined
  - [ARCH-033 — Difficulty → Level Bucketing](../arch/033-difficulty-level-bucketing.md) — the thresholds those numbers feed
  - [ARCH-034 — Video Lemmatization Cache](../arch/034-video-lemmatization-cache.md) — the cache this pipeline writes
  - [ARCH-035 — Caption Selection](../arch/035-caption-selection.md) — which transcript track the import stores
  - [SPEC-038 — Video Content Supabase Migration](038-video-content-supabase.md) — the consolidated id contract
  - [SPEC-039 — Full Database Migration](039-full-database-migration-supabase.md) — § 5.8 added the existing `/admin/*` routes
  - [SPEC-061 — Supabase Video Lemmatization + Cache ID Rebinding](061-video-lemmatization-supabase-cache.md)
  - [SPEC-091 — Subtitle HTML-Entity Decoding](091-subtitle-html-entity-decoding.md)
  - [ADR-0032 — Admin Console as a Separate Next.js App](<../adr/0032-admin-console-app.md>)
  - [ARCH-003 — Python Backend Architecture](../arch/003-python-backend-architecture.md)

## Overview

Adding videos used to mean running the Classic crawler
(`utils_scout.save_videos_with_subs_in_playlist` →
`utils_directus.save_video_with_transcript`) from a notebook against Directus
and MySQL. That path no longer matches the stack: the content lives in
Supabase (SPEC-038/039), it never scored difficulty, it created talk / TV-show
rows as a side effect, and it cannot be called over HTTP.

This spec adds ten `is_admin`-gated Flask endpoints. Seven ingest YouTube
content directly into `public.youtube_videos` through one shared pipeline
(the five below, plus `POST /admin/videos/sweep-unavailable` and
`POST /admin/videos/discover` from [SPEC-098](098-video-discovery.md)). Three
more are **read-only**: they enumerate, screen and list transcripts so the
admin console can review candidates before writing anything (SPEC-099's
Discover → Check transcripts → Add flow).

```text
Discover + Check (write nothing)
   YouTube id / channel / playlist
      │
      ├─ /admin/videos/ids           ── one page of candidate ids
      ├─ /admin/videos/screen        ── DB existence + videos.list (50/batch)
      │                                 + Shorts filter (duration heuristic)
      └─ /admin/videos/transcripts   ── caption-track listing only (one id at
                                        a time in the console; cached)
                                           │
Add (the pipeline below)  ◄────────────────┘
   YouTube id / channel / playlist
      │
      ├─ videos.list (batches of 50)  ── metadata (title, channel, date, tags,
      │                                     category, locale, duration, madeForKids,
      │                                     views / likes / comments)
      ├─ eligibility                  ── unavailable / not embeddable /
      │                                   region-restricted / locale-mismatch
      ├─ talk / tv_show               ── assigned, created from the first video
      ├─ caption pipeline             ── subs_l2 CSV (starttime,duration,line)
      ├─ lemmatize_video()            ── lemmatized_subs cache entry (ARCH-034)
      ├─ score_lemmas()               ── lex_div / word_freq / difficulty (ARCH-032)
      └─ insert or refresh            ── youtube_videos row, consolidated id (SPEC-038)
```

The add phase is unchanged. The discovery phase exists so the expensive and
irreversible half (transcript download, cache writes, scoring) runs only on
videos an admin has reviewed.

## User Stories

- As an admin, I want to paste a YouTube URL or id and have the video appear
  in the catalog with subtitles and a difficulty level, so that learners can
  watch it without anyone running a notebook.
- As an admin, I want to add a batch of ids in one call, so that a curated
  list of links does not need one request per video.
- As an admin, I want to resolve a channel handle (`@name`) to its channel id,
  so that I can pass the right reference to the channel import.
- As an admin, I want to import a whole channel or playlist in resumable
  chunks, so that a large import cannot hit a request timeout or lose the work
  it already did.
- As an admin, I want re-running an import to refresh metadata and backfill
  anything missing rather than creating duplicates, so that imports are
  idempotent.
- As an admin, I want to filter a channel import by title and to stop once a
  batch adds nothing new, so that re-importing a large channel is cheap.
- As an admin, I want imported videos filed under a talk or TV show, so the
  catalog keeps the shape the site's navigation expects.
- As an admin, I want to find and remove entries whose video has disappeared
  from YouTube, so the catalog does not advertise dead videos.
- As an admin, I want to discover new videos from search terms, so the
  catalog grows without me supplying every id.
- As an admin, I want to list a channel's or playlist's ids and screen them
  (already stored, unavailable, region-restricted, declared-language
  mismatch, no transcript) before importing, so I can choose what lands in
  the catalog instead of trusting a bulk crawl.
- As an admin, I want the screening phase to be safe to re-run and to stop or
  resume, so a large channel or a rate-limited caption service cannot cost me
  the work already done.

## How It Worked Before (Classic / notebook)

**The legacy crawler has been deleted** (`cdfce67`, `dc7b212`): its
capabilities live here now. What it did and where each part went:

| Legacy piece | What it did | Now |
|---|---|---|
| `utils_scout.save_videos_with_subs_in_playlist` | Walked a playlist, created talks / TV shows, saved videos | `import_channel()` / `import_playlist()` + the `talk`/`tv_show` parameters |
| `utils_directus.save_video_with_transcript` | Built the Directus payload and POSTed it | The importer's Supabase insert/update |
| `utils_youtube.check_and_filter_youtube` | Filtered embeddable / age / region / captions | `video_import_block_reason()` — one rule, and a `[]` no longer doubles as "the API failed" |
| `utils_video_lemma.add_lex_div_and_word_freq_to_video` | Scored one video | `lemmatize_and_score_video()` (ARCH-032) |
| `utils_scout.get_search_terms` + `search_youtube_by_google_video_multiple_pages` | Found videos from Google-Trends terms | [SPEC-098](098-video-discovery.md) |
| `utils_maintenance.search_and_destroy` | Deleted rows whose video had disappeared | `POST /admin/videos/sweep-unavailable` (report-first) |
| `utils_maintenance.add_info_to_*_by_content_survey` + `change_cover_*_to_first_episode` | Aggregated a show's fields, set its cover | `summarize_show_from_member_videos()`, run when a walk completes |
| `match_keywords` / `use_circuit_break` in the crawl loop | Title filters, stop when a page adds nothing | The same two parameters on the channel/playlist endpoints |
| `utils_directus.youtube_videos_suffix` | Per-language MySQL shard suffix | Obsolete: one Supabase table (SPEC-038) |

The reusable parts (the caption pipeline, `lemmatize_video`,
`mtld_from_lemmas`, `zipf_frequency`, `cache_video_id`) are shared; the
storage and crawling layers were rewritten.

## Pipeline

### 1. Metadata (`utils_youtube.get_video_details_batched`)

`videos.list` accepts **at most 50 ids per request** (YouTube API hard limit),
so ids are chunked at 50 and the responses merged into one
`{youtube_id: resource}` map. The function returns three things:

- `details` — the resources the API returned,
- `unavailable` — requested ids the API did *not* return (deleted, private,
  or otherwise not visible),
- `error` — set when the request itself failed (HTTP error, quota, network,
  non-JSON body).

Separating "missing id" from "failed request" is the fix for the legacy
`[]`-means-everything behaviour: a quota error must not look like 50 deleted
videos. A failing batch aborts the call with `502` instead of marking the ids
dead.

Ids are validated against `^[A-Za-z0-9_-]{11}$` **before** the request
(`normalize_video_ids`), because one malformed id makes the YouTube API reject
the entire batch with `400 invalid`.

### 2. Eligibility (`utils_youtube.video_import_block_reason`)

| Reason | Condition | `force: true` |
|---|---|---|
| `unavailable` | the API did not return the id | no |
| `not_embeddable` | `status.embeddable` is false | no |
| `region_restricted` | `contentDetails.regionRestriction` is present (either `blocked` or `allowed`) | **yes** |
| `locale_mismatch` | `snippet.defaultAudioLanguage` is present and outside the target language's locales | **yes** |
| `no_transcript` | no transcript in the L2 or one of its locales | no |
| `transcript_too_short` | a transcript exists but has fewer than `MIN_TRANSCRIPT_LINES` (4) lines | no |
| `caption_service_unavailable` | the caption lookup itself failed (IP block, rate limit) | no |

`force` bypasses the two *soft* checks; it never bypasses `unavailable` or
`not_embeddable`, which would store a video the player cannot show at all.

The locale check uses `utils_youtube.l2_locales()` — the same helper
`filter_youtube(filter_l2_code=…)` uses — so the crawler and the importer
agree on what "in this language" means.

`transcript_too_short` applies the shared ingestion minimum
(`caption_selection.MIN_TRANSCRIPT_LINES`, the same 4-line rule the legacy
crawler used) and reports the actual line count.
`caption_service_unavailable` is deliberately distinct from
`no_transcript`: a blocked or rate-limited lookup must not be recorded as a
video that has no captions. The batch summary counts both separately, and the
failure message is passed through on the result. A video that declares **no** audio
language is accepted: YouTube only sets `defaultAudioLanguage` for some
uploads, so the check can reject only a video that positively declares a
different language. It runs before the transcript download, so a rejected
video costs no caption request.

Only *new* inserts are filtered. An existing row under the same `l2` is
refreshed regardless, because the rule is "do not add", not "do not update".

**Members-only videos are not detected.** The YouTube Data API exposes no
`membersOnly` field on the video resource and no equivalent on
`videos.list`; a members-only video looks like an ordinary public video
(`privacyStatus: "public"`, `embeddable: true`). The only community-known
signal is a missing `statistics.viewCount`, which is documented as a
heuristic rather than a contract, so rejecting on it would risk dropping
perfectly good videos. Decided explicitly on 2026-10-16; revisit if the API
ever adds a real flag.

### 3. Transcript (`utils_video_import.transcript_csv`)

`app_youtubecaptions.get_best_l2_subs_with_meta(youtube_id, l2)` resolves the
caption in the L2 (or one of its locale variants, via `LOCALES`), using the
Webshare proxy and the caption cache. Which track that picks — manual vs
auto-generated, and how the locale list is applied — is documented in
[ARCH-035 — Caption Selection](../arch/035-caption-selection.md). The result
is stored as the same `subs_l2` CSV shape the rest of the catalog uses:

```csv
starttime,duration,line
0.0,2.5,你好
```

`clean_generated` defaults to **false** for imports: the legacy crawler stored
YouTube's raw auto-generated captions, and LLM-normalizing every caption line
would make bulk imports orders of magnitude slower and more expensive. The
flag can be turned on per request.

The importer still accepts ASR tracks. The admin console's discovery screen
is stricter: it marks auto-generated tracks as ineligible so the table only
offers manually created transcripts (SPEC-099 § `/content/import`). That is a
console policy, not a change to this pipeline.

### 4. Lemmatization cache (ARCH-034)

`utils_video_lemma.lemmatize_and_score_video()` calls `lemmatize_video()`,
which writes the whole-video `lemmatized_subs` entry keyed by
`cache_video_id(video_id)` — the **legacy Directus id**, so the watch page
(which translates the consolidated id back, SPEC-061) gets the same hit as for
a migrated video. `get_lemmas_from_video()` was changed to translate the cache
key the same way; before this spec it used the raw id and would have written
and looked up a cache entry under the consolidated id.

Cache writes stay **local-only**; the cron offload job (`prune_cache.py`)
moves cold entries to the shared host, exactly as for every other cache
writer.

### 5. Difficulty (ARCH-032 / ARCH-033)

The scoring math was extracted out of the Directus batch pipeline into pure
helpers so both paths share one implementation:

| Helper | Role |
|---|---|
| `compute_lex_div(lemmas)` | MTLD ÷ 1000, capped below 1, truncated to 17 dp |
| `compute_word_freq(lemmas, lang)` | mean Zipf frequency of the unique lemmas, 2 dp |
| `score_lemmas(lemmas, lang, lex_div, word_freq)` | fills in whichever half is missing, then `difficulty = lex_div / word_freq` |
| `lemmatize_and_score_video(video, l2, …)` | cache + score for one video, returns `(lex_div, word_freq, difficulty, lemma_count)` |

The incremental rule from ARCH-032 is preserved: a value that already exists
is never recomputed (and, in the refresh path, never overwritten). When both
halves already exist but `difficulty` is missing, difficulty is derived
arithmetically without re-reading the subtitles.

### 6. Insert or refresh

New rows get an **explicitly allocated consolidated id**
(`prefix * 10^10 + old_id + 1`, SPEC-038). This matters because
`youtube_videos.id` is `GENERATED BY DEFAULT AS IDENTITY` but its sequence
sits at the end of the *last* prefix block (`140000015875` at the time of
writing), so letting the default apply would file a Thai/Khmer/Malay-language
video as whatever language owns that block. `utils_content.next_video_id()`
computes the next id inside the language's own block; two concurrent imports
racing on the same id are retried (and the cache entry is re-keyed) rather
than failing the request.

Existing rows are refreshed with only the fields the API actually returned —
`metadata_from_api()` omits absent keys, so a video whose view/like counts are
hidden cannot blank those columns — plus a backfill of `subs_l2` and any
missing `lex_div` / `word_freq` / `difficulty`. Rows are inserted with
`status = 'draft'` and `type = 'other'`, matching every other row in the
table.

## API Endpoints

All of these are registered on `routes/admin.py`'s blueprint and gated by
`require_admin()` (Supabase JWT `app_metadata.is_admin`).

### Authorization

The gate is a **blueprint-level `before_request` hook**, not a call at the top
of each handler, so every current route — and any route added to the module
later — is admin-only by construction and cannot forget the check. The hook
returns the same JSON error shape the handlers used to produce:

| Request | Response |
|---|---|
| no / malformed `Authorization` header | `401 {"error": "Missing or invalid Authorization header"}` |
| expired or invalid token | `401 {"error": "Token expired" / "Invalid token"}` |
| valid token without `app_metadata.is_admin` | `403 {"error": "Admin token required"}` |
| unreachable auth host (JWKS) | `503 {"error": "Auth server unreachable"}` |

`app_metadata` lives inside the signed JWT and only GoTrue (service role) can
set it, so the claim cannot be forged by a client. A user demoted while
holding an unexpired token keeps access until that token expires — the known
limitation recorded in ADR-0032, which also means every admin endpoint
re-checks the live claim on every call.

`OPTIONS` (CORS preflight) is deliberately exempt: the browser sends it before
the real request and never attaches credentials to it, so authenticating it
would fail the preflight and the real request would never be sent — a failure
that surfaces as a CORS error (ADR-0032 / ARCH-029 § 11). Flask's automatic
`OPTIONS` response only advertises allowed methods and headers and never runs
a handler or touches the database.

`test_admin_video_import.py` asserts this structurally: it enumerates every
rule on the `admin` blueprint and requires `401` without a token and `403`
with a non-admin token, so a new unguarded route fails the suite.

| Endpoint | Method | Purpose |
|---|---|---|
| `/admin/videos/add` | POST | Add one video |
| `/admin/videos/add-batch` | POST | Add a list of ids |
| `/admin/channels/resolve` | GET | Handle / URL / id → channel id |
| `/admin/channels/add` | POST | Add (or update) a whole channel's uploads |
| `/admin/playlists/add` | POST | Add (or update) a whole playlist |
| `/admin/videos/sweep-unavailable` | POST | Find (and optionally delete) stored videos YouTube no longer serves |
| `/admin/videos/discover` | POST | Find candidates from search terms — [SPEC-098](098-video-discovery.md) |
| `/admin/videos/ids` | POST | Enumerate candidate ids from a list / channel / playlist (read-only) |
| `/admin/videos/screen` | POST | Screen up to 50 ids: DB existence, metadata, Shorts filter, optional caption-track listing (read-only) |
| `/admin/videos/transcripts` | POST | List caption tracks only — no metadata / DB re-fetch (read-only) |

### `POST /admin/videos/add`

```json
{ "youtube_id": "dQw4w9WgXcQ", "l2": "zh", "force": false, "clean_generated": false }
```

`201` when added, `200` when skipped (`status: "skipped"` + `reason`), `400`
for a malformed id or an unknown language, `502` when the YouTube API fails.

### `POST /admin/videos/add-batch`

```json
{
  "youtube_ids": ["dQw4w9WgXcQ", "abcdefghijk"],
  "l2": "zh",
  "limit": 50,
  "cursor": { "offset": 0 },
  "force": false,
  "clean_generated": false,
  "refresh_existing": true
}
```

`youtube_ids` also accepts a comma-separated string. Always `200`; the body
carries one result per processed id:

```json
{
  "results": [
    { "youtube_id": "dQw4w9WgXcQ", "status": "added", "id": 40000123456,
      "difficulty": 0.0022, "lex_div": 0.0099, "word_freq": 4.5, "lines": 312 },
    { "youtube_id": "abcdefghijk", "status": "skipped", "reason": "region_restricted" }
  ],
  "summary": { "total": 2, "added": 1, "updated": 0, "skipped": 1, "failed": 0,
               "requested": 2, "invalid": 0 },
  "next_cursor": { "offset": 2 },
  "l2": "zh"
}
```

### `POST /admin/videos/ids`

Enumerates candidates for the discovery phase. It writes nothing and calls no
caption pipeline. Exactly one source is accepted.

```json
{
  "l2": "zh",
  "channel": "@name",
  "cursor": { "page_token": "…", "skip": 0 },
  "limit": 50,
  "match_keywords": "episode"
}
```

`youtube_ids` (a list or comma-separated string, paged by
`cursor: {"offset": n}`), `channel` (handle / `UC…` id / URL) and `playlist`
(id or any URL with `list=`) are the three sources. `limit` is capped at 50
(one YouTube playlist page). `l2` is required even though this step only
lists ids: the console must never start discovery without a chosen language
(SPEC-099's language-safety rule).

```json
{
  "l2": "zh",
  "youtube_ids": ["dQw4w9WgXcQ"],
  "next_cursor": { "page_token": "…", "skip": 0 },
  "invalid": [],
  "channel": { "channel_id": "UC…", "title": "…", "uploads_playlist_id": "UU…" },
  "playlist_id": "UU…"
}
```

`next_cursor` is null when the source is exhausted. `channel` is populated
when a channel reference was resolved, so the console can show the resolved
channel without a second lookup.

### `POST /admin/videos/screen`

Screens up to **50** ids without importing them. The console accumulates the
rows and drives the pagination from the browser; there is no server-side job
or cursor (SPEC-096 § "Paging contract" explains why a job registry was
rejected).

```json
{ "l2": "zh", "youtube_ids": ["dQw4w9WgXcQ"], "check_transcripts": true }
```

Order matters for cost:

1. **DB existence** — `utils_content.get_videos_for_screening()` returns the
   stored title / duration / locale / views / has-subs for ids already in
   this L2. Those rows are answered from the database: **no** `videos.list`
   call and **no** caption listing.
2. **Metadata** — the remaining ids go through `videos.list` in one batch of
   50, so an unavailable or non-embeddable video costs no caption request.
3. **Shorts filter** — Shorts are removed before the table and before any
   caption request. The Data API exposes no Shorts flag, so the proxy is
   duration ≤ `SHORTS_MAX_SECONDS` (default 180s = YouTube's 3-minute Shorts
   maximum; override with the env var). Stored rows are filtered too, so an
   already-imported Short does not reappear. They are counted in
   `summary.shorts_excluded`; `requested` still includes them.
4. **Caption listing** (only when `check_transcripts: true`) — every
   available, embeddable video gets `select_best_l2_transcript()` (a listing
   call, cached by the caption layer; no transcript is downloaded).
   Region-restricted and declared-locale-mismatch videos are soft blocks that
   `force: true` can import, so their track is listed too — a force-add
   therefore needs no second discovery pass.

The console drives the split phases separately. **Discover** sends
`check_transcripts: false` and gets DB verdicts + metadata only, so the admin
sees the found videos before any caption request. **Check transcripts** uses
`POST /admin/videos/transcripts` (below) one id at a time, so it never
re-fetches the metadata Discover already has. Successful listings are cached
by `list_transcripts_result()` in the two-tier `caption` bucket
(`list/<hash>`, per video, language-independent), so re-running the check
phase only calls YouTube for videos that were never listed; failures are not
cached.

```json
{
  "l2": "zh",
  "l2_locales": ["zh", "zh-CN", "zh-Hans", "zh-Hant", "zh-SG", "zh-TW"],
  "results": [{
    "youtube_id": "…", "in_db": false, "db_video_id": null,
    "title": "…", "channel_id": "UC…", "channel_title": "…",
    "thumbnail": "https://i.ytimg.com/vi/…/mqdefault.jpg",
    "duration": "PT3M44S", "views": 1234,
    "declared_audio_locale": "zh-CN", "audio_matches_l2": true,
    "available": true, "embeddable": true, "region_restricted": false,
    "block_reason": null,
    "transcript": { "language_code": "zh", "language": "Chinese", "is_generated": false },
    "transcript_status": "found",
    "transcript_error": null
  }],
  "invalid": [],
  "caption_error": null,
  "summary": {
    "requested": 1, "invalid": 0, "shorts_excluded": 0,
    "in_db": 0, "checked_metadata": 1,
    "unavailable": 0, "not_embeddable": 0, "region_restricted": 0,
    "locale_mismatch": 0, "transcript_found": 1,
    "auto_generated_transcript": 0, "no_transcript": 0,
    "caption_service_unavailable": 0, "not_checked": 0, "eligible": 1
  }
}
```

`transcript_status` is one of `found` (a track in the L2 locale family
exists), `no_transcript`, `caption_service_unavailable`, `stored` (the video
is already in the DB and has `subs_l2`), or `not_checked` (skipped because it
was unavailable/non-embeddable, the caller disabled checks, or an earlier
caption lookup in the same batch blocked the service).

`block_reason` is the raw `video_import_block_reason(force=False)` verdict:
`unavailable` / `not_embeddable` / `region_restricted` / `locale_mismatch` /
null. The console decides eligibility for its current `force` setting from
these raw flags; the backend does not bake `force` into the screen.

**Manual transcripts only.** `summary.eligible` counts new rows with no hard
block and a `found` track whose `is_generated` is **false**. An auto-generated
(ASR) track is counted in `auto_generated_transcript` and is never eligible:
SPEC-099's admin import policy only offers manually created captions. The
importer itself still accepts ASR for other callers (ARCH-035), so this is a
discovery-screen rule, not a change to ingestion.

A **caption-service failure** is returned as `caption_error` and stops
further listings in that call (remaining ids are `not_checked`). It is never
recorded as `no_transcript`, and the console can retry just those rows
without re-enumerating the source. The upstream exception is logged in full
on the server; the API returns a short, readable message (for a rate limit:
"YouTube temporarily blocked the caption lookup (HTTP 429). Progress is
saved; retry the unchecked rows later."). A **metadata failure** is a `502`,
never a page of ids marked unavailable. The endpoint is otherwise read-only
(no commit, no cache writes except the caption layer's own listing cache).

Listings are **throttled** (`CAPTION_LIST_DELAY_SECONDS`, default 0.2s
between tracks) and a rate-limited listing is retried once
(`CAPTION_RATE_LIMIT_RETRIES` / `CAPTION_RATE_LIMIT_BACKOFF_SECONDS`). This
reduces the chance of tripping YouTube's `/sorry/index` 429 but cannot
eliminate it: it is an anti-bot/IP block on the caption proxy, so the console
retains the stop-and-retry flow.

### `POST /admin/videos/transcripts`

The Check-transcripts phase, split out so it does **not** re-fetch metadata
or touch the database. The console sends **one id per call**, which lets the
table show a spinner against exactly one video; the endpoint also accepts up
to 50 for other callers.

```json
{ "l2": "zh", "youtube_ids": ["dQw4w9WgXcQ"] }
```

```json
{
  "l2": "zh",
  "results": [{
    "youtube_id": "dQw4w9WgXcQ",
    "transcript": { "language_code": "zh", "language": "Chinese", "is_generated": false },
    "transcript_status": "found",
    "transcript_error": null
  }],
  "invalid": [],
  "caption_error": null,
  "summary": {
    "requested": 1, "invalid": 0, "transcript_found": 1,
    "auto_generated_transcript": 0, "no_transcript": 0,
    "caption_service_unavailable": 0, "not_checked": 0
  }
}
```

The same throttling, one-retry, caption-error and `is_generated` rules as the
screen endpoint apply. A caption failure stops further listings in the call
and returns a short `caption_error`; the full upstream exception is logged.
The listing cache is shared with the screener/importer, so a re-run of this
endpoint for an already-listed video is a cache hit.

### `GET /admin/channels/resolve`

`?channel=@name` (aliases: `handle`, `url`, `q`) — a handle, a `UC…` id, or
any channel URL (`/channel/UC…`, `/@name`, `/c/Name`, `/user/Name`).

```json
{ "channel": { "channel_id": "UC_x5XG1OV2P6uZZ5FSM9Ttw", "title": "…",
               "handle": "@googledevelopers", "uploads_playlist_id": "UU_x5XG1OV2P6uZZ5FSM9Ttw",
               "thumbnail": "…", "subscribers": "2680000", "video_count": "6117" } }
```

Resolution tries `channels.list?forHandle=` first and falls back to
`forUsername=` so legacy `/c/` and `/user/` URLs still resolve.
`404` when nothing matches, `502` when the lookup itself failed.

### `POST /admin/channels/add` and `POST /admin/playlists/add`

```json
{ "channel": "@name", "l2": "zh", "limit": 50, "cursor": { "page_token": "…", "skip": 0 } }
```

```json
{ "playlist": "https://www.youtube.com/playlist?list=PL…", "l2": "ja", "limit": 50 }
```

Both walk a playlist (`channels/add` uses the channel's `UU…` uploads
playlist) and run each video through the same pipeline, then add
`"channel"` (channels only) and `"playlist_id"` to the batch response shape.

**Walk options** (both endpoints, and `talk`/`tv_show` on `add-batch` too):

| Field | Behaviour |
|---|---|
| `match_keywords` | list (or comma-separated string) of case-insensitive regexes; only videos whose *title* matches one are imported. Filtering happens before `limit` is counted, so a filtered import still returns a full page, and the cursor counts raw playlist positions so it can neither skip nor repeat entries. An invalid pattern is a `400`. |
| `use_circuit_break` | stop paging when a call adds nothing new — the guard against re-walking an already-imported channel. Reported as `circuit_broken: true` so an early stop is never mistaken for the end of the playlist (`next_cursor: null`). |
| `talk` / `tv_show` | an existing id, or a title matched case-insensitively in this language and **created from the first imported video** when missing. A video already belonging to a talk or show keeps it. When a walk reaches the end of the playlist, the show's `avg_views`, top-20 tags and most-common `made_for_kids`/`channel_id`/`category`/`locale` are recomputed from its videos, and its cover is set only if it has none (a curated cover survives). An unfinished walk deliberately does not summarise a partial show. |

## Paging contract

A whole channel or playlist can be thousands of videos, each needing a
transcript download, so a single synchronous call would outlive gunicorn's
120-second request timeout. Both bulk shapes are therefore paged:

- **Flat list** (`add-batch`): `limit` (default 50, max 500) plus
  `cursor: {"offset": n}`; the response's `next_cursor` is null on the last
  page. The admin console sends **25** per page: each id downloads and scores
  a transcript inside the request, and a 50-id page can outlive the
  Cloudflare/gunicorn timeout (whose 502 has no CORS header and looks like a
  CORS failure).
- **Playlist / channel**: `limit` plus an opaque
  `cursor: {"page_token": …, "skip": n}`. `skip` lets a call that stops
  mid-page resume exactly there, instead of re-listing the playlist from the
  start on every call. `next_cursor` is null once the playlist is exhausted.

`import_videos()` commits after **each** video, so a failure late in a page
cannot discard the rows already reported as added; a per-video exception is
caught, recorded as `failed`, and the rest of the page continues.

The discovery phase is paged the same way but stays **stateless**:
`/admin/videos/ids` returns one playlist page (max 50 ids), and
`/admin/videos/screen` accepts at most 50 ids (one `videos.list` batch plus
an optional caption listing). The console loops and accumulates the rows in
the browser. Keeping the result set client-side is what makes
"add all eligible (including rows behind the infinite scroll)" possible
without a server-side job.

The check phase is deliberately **one id per request** in the console:
`/admin/videos/transcripts` accepts one id, so the spinner is exactly one
video, and the endpoint does no metadata or DB work. A 500-video check is 500
small requests, each a caption listing (or a cache hit); Stop/Continue and the
per-video cache keep that practical.

Background jobs with progress polling were considered and rejected: they need
a job registry that survives worker restarts (gunicorn runs 4 workers, and an
in-process registry is not shared), for a workflow that an admin tool can
just loop over. That decision also rules out a server-held discovery run;
re-running discovery after a page reload is cheap because only successful
caption *listings* are cached by the caption layer, not the table rows.

## Error Mapping

| Exception | HTTP | Meaning |
|---|---|---|
| `UnknownLanguageError` | 400 | `l2` is not a known language |
| `ValueError` / `TypeError` | 400 | malformed id, missing field, bad cursor |
| `ChannelNotFoundError` (`LookupError`) | 404 | no channel for the reference |
| `YouTubeApiError` | 502 | `videos.list` failed (quota, auth, network) |
| `PlaylistFetchError` | 502 | `playlistItems.list` failed |
| `YouTubeChannelError` | 502 | `channels.list` failed |
| anything else | 500 | logged, then returned as `{"error": …}` |

## Files

| File | Role |
|---|---|
| `zerotohero-python-server/utils_video_import.py` | The ingestion pipeline (single, list, channel, playlist), show assignment, the unavailable sweep; `list_video_ids()` enumerates without importing |
| `zerotohero-python-server/utils_video_screening.py` | The read-only discovery screen: DB existence, metadata, caption-track listing, summary |
| `zerotohero-python-server/utils_video_discovery.py` | Search terms, scraping, vetting — [SPEC-098](098-video-discovery.md) |
| `zerotohero-python-server/routes/admin.py` | The admin ingestion, discovery and sweep endpoints |
| `zerotohero-python-server/utils_youtube.py` | Batched `videos.list` + availability, `video_import_block_reason()`, `l2_locales()`, channel/playlist reference parsing and resolution |
| `zerotohero-python-server/utils_video_lemma.py` | `compute_lex_div` / `compute_word_freq` / `score_lemmas` / `lemmatize_and_score_video`; cache-key translation in `get_lemmas_from_video` |
| `zerotohero-python-server/utils_content.py` | `next_video_id()`, `get_videos_by_youtube_ids()`, show lookup + survey, sweep paging |
| `zerotohero-python-server/caption_selection.py` | The caption rule the transcript step uses (ARCH-035) |
| `zerotohero-python-server/app_youtubecaptions.py` | Transcript download, shared with every other caption consumer |
| `zerotohero-python-server/test_admin_video_import.py` | Importer unit + route tests (64 cases) |
| `zerotohero-python-server/test_admin_video_screening.py` | Discovery enumeration + screening tests (22 cases) |
| `zerotohero-python-server/test_video_discovery.py` | Discovery tests (12 cases) |

## Testing

`python3.10 -m pytest test_admin_video_import.py test_admin_video_screening.py test_video_discovery.py` covers:

- eligibility matrix (unavailable / not embeddable / region-restricted /
  locale-mismatch, and `force` overriding the two soft checks),
- id allocation and the payload written for a new video,
- refresh-only semantics (`refresh_existing: false`), metadata refresh, and
  the arithmetic difficulty backfill that needs no transcript,
- per-video failure isolation and per-page cursoring,
- playlist `(page_token, skip)` paging and API-error propagation,
- keyword filtering (including cursor honesty across a filtered page) and the
  circuit break,
- talk / TV-show resolution, lazy creation, assignment rules and the
  end-of-walk aggregation,
- the unavailable sweep (report-only default, opt-in delete, no deletion on an
  API failure, keyset cursor),
- route-level auth (403), validation (400), status codes (200/201), and
  error mapping (404/502).

`test_admin_video_screening.py` additionally covers the discovery decisions:

- already-stored rows come from the DB and make **no** metadata/caption call,
- metadata runs before caption listing, and hard-blocked videos (unavailable /
  non-embeddable) cost no caption request,
- soft blocks (region / declared locale) still get a caption listing,
- a manual transcript is eligible; an auto-generated one is listed/counted
  but **not** eligible,
- `no_transcript` is distinct from `caption_service_unavailable`, a
  caption-service failure stops further listings (remaining rows are
  `not_checked`), and the public error is concise while the full upstream
  message is not returned,
- a rate-limited listing is retried once when the retry budget allows,
- Shorts (duration ≤ `SHORTS_MAX_SECONDS`, including an already-stored one)
  are excluded before any caption call and counted in `shorts_excluded`,
- the transcript-only check makes no metadata/DB call and returns the same
  manual/auto/no-transcript verdicts,
- duplicate/invalid ids, the 50-id cap, metadata failure → `YouTubeApiError`,
- `/admin/videos/ids` paging for a pasted list, a channel's uploads playlist,
  validation, and playlist failure → 502,
- `/admin/videos/screen` row shape, language/id validation, and the 502 path;
- `/admin/videos/transcripts` returns results without metadata and validates
  the language/id list.

Everything network- or NLP-shaped (YouTube API, caption pipeline,
lemmatizer, database) is faked; the tests assert the ingestion *decisions*.

## Known Limitations

- **Members-only videos are not filtered** (see § 2). They will be added, and
  will fail to play for non-members.
- **Region restriction is "any `regionRestriction`"**, which is stricter than
  the crawler's old "blocked in US/GB/CA" rule. `force: true` overrides it,
  as it does the declared-locale check.
- **The declared-locale check only sees `defaultAudioLanguage`** (or
  `defaultLanguage`). YouTube omits it for many uploads, so a video whose
  audio is in a different language is still imported whenever it declares
  nothing; the transcript requirement is the only other guard.
- **N-gram tokens are computed inline** since SPEC-106: `create_video` /
  `update_video` call the shared tokenizer, so an imported or edited continua
  video is searchable immediately. `backfill_subs_ngram_tsv.py` remains the
  repair tool for rows written by other paths.
- **Duplicates are rejected by a unique index.**
  `youtube_videos_youtube_id_l2_key` (added 2026-10-19) enforces one row per
  `(youtube_id, l2)`. The importer's existence check is the normal path; a
  concurrent insert is reported as `skipped` / `reason: "exists"` instead of
  retrying the id allocation.
- **No admin console UI in this spec** — it shipped separately as
  [SPEC-099](099-admin-content-management.md), which drives these endpoints
  from `apps/admin` (single / batch / channel / playlist, cursor paging and a
  live result log).
- **`duration` is stored as the raw ISO-8601 string** (`PT3M44S`), matching
  every existing row; nothing parses it at write time.
- **Transcript downloads are serial** within a page. `limit` keeps a call
  inside the request timeout rather than relying on concurrency.
- **A caption-service failure looks like "no transcript".** When YouTube
  blocks or rate-limits the caption request (observed live on 2026-10-16:
  `HTTPSConnectionPool … /sorry/index … too many 429 error responses`), the
  caption pipeline returns no lines and the video is reported as
  `no_transcript`. Re-running the import later is safe — existing rows are
  refreshed and rows that were skipped for a missing transcript are retried.
- **A new video added under a second language gets a second row** (ids are
  per-language-prefixed and dedupe is per `(youtube_id, l2)`), which is the
  documented behaviour: "already exists in the DB under the same l2".
- **The discovery transcript check is a listing, not a download.** It proves
  a track in the L2's locale family exists; it does not prove the ≥4-line
  minimum (`transcript_too_short`) or that the transcript is any good. The
  add phase still reports those outcomes per video.
- **The discovery screen excludes ASR from eligibility.** A `found` track
  with `is_generated: true` is listed and counted (`auto_generated_transcript`)
  but never eligible; SPEC-099's table only offers manually created
  transcripts. The importer itself still accepts ASR (ARCH-035), so calling
  `/admin/videos/add` or `/add-batch` directly can still store an
  auto-generated transcript.
- **Caption listing can still be rate-limited.** The throttle + one retry
  reduce the chance, but a sustained `/sorry/index` 429 is an IP/proxy block;
  the call then stops, preserves the rows already screened, and the console
  offers *Retry unchecked*. The full upstream error is only in the server log.
- **Shorts detection is duration-based.** The Data API exposes no Shorts
  flag, so `SHORTS_MAX_SECONDS` (default 180, YouTube's 3-minute Shorts
  maximum) is the proxy. A normal 2–3 minute video is filtered too; lower the
  env var to 60 for classic short-form only. A Short already in the DB is
  filtered from Discover as well.
- **Video metadata is not cached.** `videos.list` is fetched once per video
  during Discover; the transcript-only Check endpoint does not re-fetch it.
  Re-running Discover does fetch metadata again. Caption **listings** are
  cached (the `list/<hash>` entries), so re-running Check is the cheap one.
- **Already-stored rows skip YouTube entirely.** Their title/duration/locale
  come from `youtube_videos`, and no caption listing is made even when
  `subs_l2` is empty (`transcript_status: "not_checked"`). This keeps a
  re-run of an already-imported channel cheap; the trade-off is that the
  discovery table cannot show a transcript locale for those rows.
- **The discovery result set lives in the browser.** There is no server-side
  job/cursor, so a page reload loses the screened rows and the run must be
  repeated. Caption listings are cached, so a re-run is mostly metadata
  calls.
- **Screening is serial where it is expensive.** One request screens at most
  50 ids, and caption listings within it run serially; this keeps a call
  inside gunicorn's timeout and avoids tripping the caption rate limit.
- **`audio_matches_l2` only sees a declared language.** YouTube omits
  `defaultAudioLanguage` on many uploads; an absent declaration is reported
  as `null` (unknown) for already-stored rows and as "compatible" for live
  metadata (`video_locale_matches_l2`). The table cannot detect the actual
  spoken language.

## Open Questions

- ~~Should imports also mark the video as searchable?~~ **Resolved 2026-10-19
  (SPEC-106):** the write path computes the n-gram tokens inline.
- Should `clean_generated` default to true for single adds (where the cost is
  one video) and stay false for bulk?
- Is a members-only heuristic worth adding as an *advisory* flag (e.g.
  `warnings: ["possible_members_only"]`) rather than a rejection?
- ~~Should the admin console expose these endpoints, and if so does it need a
  job/progress view rather than the cursor loop?~~ Resolved by
  [SPEC-099](099-admin-content-management.md): the console drives the cursor
  loop from the browser (one page per request) and keeps no server-side job
  registry.
- Should discovery persist its screened rows (session storage or a table) so
  a page reload or a long channel walk can resume without re-screening?
  Deferred: the re-run is read-only and caption listings are cached, and a
  persisted result would need invalidation when the catalogue changes.
- Should `screen` batch caption listings with a small worker pool? The
  current serial loop is deliberate (rate limits), but a bounded pool (2–4)
  could make a 500-video channel noticeably faster. Needs a measured
  rate-limit trial before changing it.
