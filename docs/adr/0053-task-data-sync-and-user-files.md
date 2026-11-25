# ADR-0053 — Task state syncs through Flask, and user files live in a private store on the shared host

**Status:** Accepted (2026-11-24), revised (2026-11-25)
**Revision 1 (2026-11-25):** the storage target changed from a Supabase Storage bucket to the
existing PHP shared host, and the recordings table was generalised into a user-file store.
Revision 0 rejected the shared host on the grounds that it is "public by design … no upload API";
that was true of the `/data/` content tree and false of the cache tier, which is outside the web
root, key-gated, and has working write and delete endpoints (evidence under Context). The
`*.supabase.co` accessibility constraint that drove the original choice has not changed, and
neither has anything about the Flask-only boundary or the task-state design.
**See also:**
- [ADR-0044: Textbook exercise state is local-only](0044-textbook-exercise-state-local-only.md) — **superseded in part by this record.** Its store shape, content-version rule and void semantics stand; only decision 3 ("no server table, endpoint or sync") is replaced here, exercising the escape hatch that ADR named: *"If server persistence is wanted later, it reuses the ADR-0040 outbox pattern and the same append-only + void + idempotency-key shape, and that is a separate decision."* This is that decision.
- [ADR-0040: Harden the web SRS sync outbox](0040-srs-sync-outbox-hardening.md) — the durable-pending-queue pattern the text entities reuse
- [SPEC-037: Two-tier remote cache offload](../specs/037-two-tier-remote-cache-offload.md) and [ARCH-034: Video lemmatization cache](../arch/034-video-lemmatization-cache.md) — the cache tier on the same host: endpoints, key, sanitisation, timeouts
- [ADR-0043: Serve textbook media from the shared host](0043-textbook-media-hosted-on-shared-host.md) — the *content* tree on the same box, and why it is public
- [ADR-0023: Proxy Supabase Auth through Flask](0023-proxy-supabase-auth-through-flask.md) and [ADR-0046: No mainland-China-blocked host](0046-china-blocked-third-party-hosts.md) — why clients never talk to a storage backend directly
- [SPEC-053: Mobile offline mode](../specs/053-mobile-offline-mode.md) — the `sync.db` outbox / `entity_cache` / `/sync/pull` engine extended here
- [SPEC-039: Full database migration](../specs/039-full-database-migration-supabase.md) — Supabase is the store; Flask is the only gateway
- [SPEC-095: Interactive textbook](../specs/095-interactive-textbook.md) — the feature whose Non-Goals this supersedes
- [SPEC-111: Task data sync, user file store and student recordings](../specs/111-task-data-sync-and-user-files.md) — the implementation plan

---

## Context

### The decision ADR-0044 recorded

On 2026-09-11 ADR-0044 decided that textbook exercise state — in-progress
responses, completion, attempt outcomes — lives **only** on the device:
`localStorage` on web, `AsyncStorage` on mobile. It recorded the reason (no
user-data DDL owner existed mid-migration, and reading position already had the
same accepted gap), the cost (no cross-device sync, no server-side analytics,
nothing recoverable if storage is cleared), and an explicit escape hatch for a
later decision. SPEC-095's Non-Goals restated it as product, not phasing.

Two product requirements now contradict that, and both are ordinary consequences
of the feature growing:

1. **A student's answers should follow them between web and mobile.** A workbook
   is worked through across days and devices; a task started on a laptop and one
   finished on a phone are one task, not two.
2. **One task requires the student to speak.** D ➐ of the pilot unit asks for a
   recording of the student introducing their city's public transport. Today the
   app captures no audio at all, so the task tells the student the recording is
   "out of band" — the workbook instruction is followed outside the product.

### As-built, verified rather than assumed

**Persistence is device-only and synchronous.**

- Web: `TEXTBOOK_STORAGE_PREFIX = 'lp:textbook:'` (`apps/web/src/components/textbook/task-provider.tsx:43`), `loadPersistedTask` / `savePersistedTask` over `window.localStorage`. The store is built synchronously in a `useMemo`; a `pastHydration` gate keeps the server-rendered HTML unanswered so React does not discard the tree.
- Mobile: the same prefix over `AsyncStorage` (`apps/mobile/components/textbook/task-provider.tsx:34`), loaded by the route **before** the provider mounts so the store can stay synchronous.
- `PersistedTaskState` = `{ taskId, contentVersion, responses, attempts }` (`packages/textbooks/src/store.ts:46-52`); `submit()` voids prior attempts and appends one (`:185-208`); `recordChecked()` appends a completion attempt (`:221-241`) — so **completion is already derived from attempts**, not stored separately.

**Attempt ids are not globally unique.** `AttemptRecord.id` is
`` `${this.task.id}#${this.attemptSeq}` `` (`store.ts:195,228`). Two devices
resuming the same task both produce `tblt-hsk4.u06.A.t1#1`. Today that is invisible
because ids never leave the device; any server keyed on it collides on the first
second device.

**There is no upload path in our applications and no recording anywhere.**
Flask contains no `request.files`, no multipart handling and no
`MAX_CONTENT_LENGTH`; no app in the repo constructs a `FormData`;
`supabase/migrations/` creates no bucket; `expo-audio` / `expo-av` are not
installed (mobile plays task audio through `expo-video`, deliberately, to avoid a
native rebuild — `apps/mobile/components/textbook/TaskAudio.tsx:19-27`). Mobile's
config explicitly **disables** the microphone permission today
(`apps/mobile/app.config.js:91-95`).

**What already exists and should carry the weight:**

- `POST /sync/push` — durable outbox ops with per-op idempotency keys, savepoint isolation per op, `MAX_PUSH_OPS = 200` (`routes/sync.py:18,44`), handler registry `_HANDLERS` + `_ENTITY_SCHEMAS` (`utils_sync.py:365-384`), and a per-user change log `public.user_sync_log` written in the same transaction as the row (`utils_sync.py:89-113`).
- `GET /sync/pull?cursor=` — the same log as a pull stream with tombstones (`utils_sync.py:115-143`). Mobile already applies it generically into `entity_cache` (`apps/mobile/lib/sync-engine.ts:210-290`); `mergeChange` is entity-agnostic, so a new entity needs no pull code.
- Client payload contracts: `packages/utils/src/sync-entities.ts` (whole-row schema + `coalesce` per entity, validated at enqueue).
- Web precedent for a durable local queue without SQLite: the SRS pending-op queue hardened by ADR-0040 (`apps/web/src/lib/srs-pending-queue.ts`).

**Two constraints decide where the bytes may live.**

- **Clients never touch a storage backend directly.** All user data goes through Flask (AGENTS.md rule 5, ADR-0023, SPEC-039 decision 3).
- **`*.supabase.co` is unreachable from mainland China.** ADR-0046 measured on-path TLS resets; this is why GoTrue is proxied, and it would apply to a client-addressable Storage URL too. Proxying through Flask resolves it regardless of the backend.

### Revision 1: the shared host is a private, key-gated store — not a public one

Revision 0 rejected the shared host as "public by design … no upload API, no
per-user authorisation, no deletion path". That describes the **content tree**
(`~/zerothero-server-data`, served publicly at `/data/`, published by `rsync` —
ADR-0043). It does not describe the **cache tree**, which is the tier this
project already uses as its overflow storage:

- **Endpoints already live in production** (`SPEC-037` § "Shared Host API", `ARCH-034` § "Two-tier read/write"): `save-flask-cache.php` (POST raw body → `~/zerothero-server-flask-cache/{bucket}/{key}`), `load-flask-cache.php` (GET, bytes or `null`), `load-flask-cache-batch.php`, `delete-flask-cache.php`, `delete-flask-cache-batch.php` (≤ 5,000 keys per request).
- **Key-gated**: every call needs an `X-Cache-Key` header matching `apikeys.json`; buckets are `[a-z0-9_-]` and each key segment is sanitised to `[A-Za-z0-9._-]`, so a key cannot traverse (client side in `remote_cache.py:51-67`).
- **Outside the web root, verified 2026-11-25**: `GET /zerothero-server-flask-cache/` → `404`, while `GET /data/` → `200` (public, directory index). `GET`/`POST` to the two PHP endpoints without the key → `401 Unauthorized`.
- **Capacity**: the shared host has ~5.8 TB free and is already the overflow destination for the 39 GB local cache (`SPEC-037:20-36`); it is a product dependency today (dictionary images, stroke SVGs, textbook media, cache tier).
- **Client timeouts**: read 5 s, write 60 s, delete 10 s (`ARCH-034`).

So the host is a working private file store with one gap that matters here: it has
**no per-object isolation** (a single static key reads or writes anything in the
tree) and **no `Range` support** in the existing read endpoint. Both are fixable
scoped to a dedicated endpoint pair, and the second is ~30 lines of PHP.

### Why a generic store rather than a recordings table

The only binary this project would store today is a student's task recording. It
will not be the only one: profile images, attachments on a note, exported decks and
scanned workbook pages are all the same shape — an authenticated user's private
bytes with a lifespan of their own. A `user_task_recordings` table would be copied
for the next kind, and each copy would re-answer the same questions
(authorisation, retention, deletion, content-type safety) slightly differently. One
store with an explicit per-kind policy answers them once.

### The DDL-ownership objection no longer holds

ADR-0044 rejected server tables partly because *"`supabase/migrations/` does not
own the SRS tables"*. That now has a precedent:
`supabase/migrations/202610170001_affiliates_coupons.sql` creates user-owned
tables with `user_id uuid not null references auth.users(id) on delete cascade` in
a normal migration, and `202608200002_security_phase1_identity_shadow.sql` /
`202608200003_security_phase2_rls_policies.sql` define the ownership column and
the owner policy shape. New user-data tables can be added the clean way; they do
not need the lazy runtime DDL `user_srs_review_log` uses.

## Decision

**Task state — responses, attempts, completion — is stored in Supabase and synced
through Flask. User-generated files live in a private tree on the existing PHP
shared host, behind a dedicated key and dedicated endpoints, and are served only
by Flask. Both are general mechanisms, not one-off features.**

1. **Three tables, one per conflict semantics.** `user_task_responses` (one row
   per user + task + blank, last-write-wins), `user_task_attempts` (append-only,
   immutable except `voided_at`), `user_files` (a generic file registry: `kind`,
   `owner_type`, `owner_id`, `slot`, bytes metadata, `voided_at`). Created in
   `supabase/migrations/` with `references auth.users(id) on delete cascade` and
   owner RLS policies, and the two security-migration table arrays are extended
   so new tables inherit the same baseline.
2. **Attempts keep ADR-0044's shape and gain a stable id.** A new attempt gets a
   client-generated stable id at creation (`crypto.randomUUID()` on web, the
   Hermes-safe `makeSyncId()` on mobile — the column is `text` so the format is
   not a schema concern); the old `taskId#seq` form is retired rather than
   migrated (nothing has ever left a device). That id is the idempotency key —
   replaying a push cannot mint a second attempt, and two devices cannot collide.
3. **Completion stays derived.** No completion table and no `completed` flag: the
   latest un-voided attempt's `result.complete` is the answer, exactly as the TOC
   and picker compute it locally today.
4. **Responses are per-blank last-write-wins.** Per blank, not per task. Rows carry
   the `content_version` they were written against and a read drops rows whose
   version no longer matches — the local store's existing rule. Stale rows are
   ignored, never deleted, so a content revert restores them.
5. **User files live on the shared host, in a tree outside the web root, behind
   their own key.** `~/zerothero-user-files/{user_id}/{kind}/{file_id}.{ext}`,
   written and read only through a dedicated PHP endpoint pair
   (`save-user-file.php` / `load-user-file.php` / `delete-user-file.php` /
   `delete-user-files-batch.php`) authed by a **separate** `X-User-Files-Key`, not
   the cache key. Rotation and blast radius stay independent of the cache tier. No
   client ever receives a URL for the shared host.
6. **One store, not one table per feature.** A file is described by `kind` +
   `owner_type` + `owner_id` + `slot`; a **per-kind policy registry** in Flask
   declares allowed MIME types, byte cap, optional duration cap, and whether the
   kind *replaces* the previous file for its slot or appends. Replacement is
   enforced by a nullable `live_key` column with a partial unique index
   (`where live_key is not null and voided_at is null`), so "re-record replaces"
   is a constraint rather than a convention.
7. **Bytes are stored as recorded, with declared MIME and extension — no
   transcoding.** The host has no ffmpeg and adding it would put CPU on the upload
   path; both containers clients produce (WebM/Opus, Ogg/Opus, MP4/AAC) already
   play in the only two clients. Mono and a small bitrate are requested
   client-side; byte and duration caps are enforced **server-side** per kind.
8. **Text writes ride the existing durable path; byte writes get their own
   endpoint.** `task_response` and `task_attempt` become sync entities
   (`sync-entities.ts` + `_HANDLERS` + `_ENTITY_SCHEMAS`). Files do not: an upload's
   row insert is owned by that request, so the row has exactly one writer, and the
   endpoint appends its change to `user_sync_log` so other devices learn about it
   through the pull they already run.
9. **Local storage remains the working copy; the network never blocks a task.**
   Offline keeps working and the queue drains later. A signed-out student keeps the
   local-only behaviour ADR-0044 describes.
10. **Unchanged from ADR-0044:** textbook performance does not feed SRS (D5), and
    Pro gating is content access, never a per-attempt or per-byte allowance (D6).
    File storage is bounded by retention policy, not by plan.

## Consequences

**Gains**

- A student's task work — answers, attempts, completion, recordings — follows them
  between web and mobile and survives a cleared browser.
- D ➐ becomes a real speaking task inside the product.
- Per-blank attempt outcomes become queryable server-side.
- The text half is close to free: outbox, idempotency table, change log, pull merge
  and payload validation already exist and are used by five entities.
- **Files cost nothing incremental and have no quota wall**: ~5.8 TB free versus
  Supabase Storage's 1 GB free / 100 GB Pro at $0.0213/GB-month plus egress. At
  ~2–15 MB per active student, the free Supabase plan holds roughly a hundred
  students before it breaks.
- **The generic store pays for future kinds**: profile images, note attachments and
  exports get authorization, caps, content-type safety and deletion for free.

**Costs and risks**

- **New PHP in a repository we cannot test locally.** The endpoints live in
  `zerothero-server`, deployed to the shared host, and there is no PHP binary in the
  dev environment (`SPEC-099:784`). Changes are reviewed and then proven with a
  round-trip probe against the host, not with a unit test.
- **No per-object isolation in the storage layer.** One key reads or writes any path
  in the tree; ownership is enforced by Flask alone. A separate key bounds blast
  radius and rotation coupling, but this is a weaker second gate than Storage RLS
  would have been. The store must therefore never grow a public read path, and every
  endpoint that returns bytes must check ownership first.
- **`Range` must be implemented.** The existing read endpoint returns the whole body;
  seeking needs `fseek`-based range handling in the new endpoint, or whole-file
  playback (acceptable at ≤ 2 MiB, worse as files grow).
- **Body-size limit is unmeasured.** PHP's `post_max_size` / `memory_limit` on that
  host are unknown, and no cache key exists on this machine to probe with. The cap
  must be measured before it is trusted.
- **A single shared box, no SLA**, now the store for personal data as well as cache.
  Its availability is already a product dependency (images, textbooks, cache), so
  this widens an existing risk rather than adding a new one.
- **Backup retention is unsettled.** Whether a deleted recording lingers in host
  backups is unknown and must be established before the privacy copy claims deletion.
- **Voice is personal data.** Owner-only access, no sharing, delete control, deletion
  on account close, privacy copy — and the account-deletion path must now delete rows
  *and* objects, which no `on delete cascade` can do.
- **A new native dependency on mobile** (`expo-audio` + microphone permission → a new
  development build).
- **Web rendering gets a second hydration hazard**: server-owned state must not be
  read during render, for the same reason device state must not be.
- **Content versioning becomes load-bearing server-side too.** Re-authoring a shipped
  task without bumping its version orphans answers on both sides of the sync now.

## Alternatives Considered

- **Keep it local-only (ADR-0044 as written).** Rejected: both requirements are
  product requirements, not nice-to-haves, and D ➐ cannot be completed as authored.
- **A Supabase Storage bucket (revision 0's choice).** Still the strongest option on
  isolation — per-object policies, signed URLs, `Range`, metered quota — but it costs
  a quota wall at exactly the volume this feature exists to produce (1 GB free;
  ~100 students), bills egress for playback that is already proxied through the VPS,
  and buys per-object policy we cannot use from a client that is not allowed to talk
  to Supabase.
- **Postgres `bytea` / large objects.** Rejected: megabytes into the database and
  every backup, `Range` would be hand-written, TOAST churn on a hot table.
- **The public `/data/` content tree.** Rejected: public by construction and
  published by `rsync`; there is no authorization to add.
- **Per-feature tables and endpoints for each binary kind.** Rejected: every kind
  would re-answer authorization, retention, content-type safety and deletion, and
  they would drift.
- **Client → shared host with signed URLs.** Rejected: it would put a second
  credential and a request path outside Flask, and the host is not a CDN.
- **Base64 the audio into a `task_attempt` payload / the sync log.** Rejected:
  `/sync/push` accepts 200 ops per request and `user_sync_log` is the **pull** stream
  every device replays — megabytes would be re-sent to every device.
- **Keep every take per slot.** Rejected for now: 3–4× the storage for history nobody
  has asked to browse; the metadata log keeps the fact and duration, so keeping bytes
  can be added later without a schema rewrite.
- **Transcode to a single format on upload.** Rejected: no ffmpeg on the host, CPU per
  upload, and both client formats already play back on both platforms.
- **Lazy runtime DDL instead of a migration.** Rejected: the pattern exists for
  historical reasons; a new user-data table deserves the FK-cascade + RLS treatment
  the affiliates migration demonstrates.
- **A separate completion table.** Rejected: completion is already an attempt, and two
  sources for one boolean is how they drift.
