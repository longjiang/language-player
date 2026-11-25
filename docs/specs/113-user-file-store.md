# SPEC-113: User File Store

## Metadata

- **Spec ID**: SPEC-113
- **Feature**: A private, per-user byte store on the shared host — per-kind policy, resumable chunked upload, owner-only playback and deletion — for files users create (first kind: a student's task recording)
- **Status**: draft — **design only, nothing implemented**
- **Created**: 2026-11-25
- **ROADMAP Phase**: Phase 5 (first consumer is the interactive textbook; the store itself is cross-cutting)
- **Governing decision**: [ADR-0053](../adr/0053-task-data-sync-and-user-files.md) revisions 1–3
- **Consumers**: [SPEC-111](111-task-data-sync-and-recordings.md) — task state sync, with `task_recording` as the first registered kind
- **Backend ref**: `zerotohero-python-server/routes/user_files.py` (new), `utils_user_files.py` (new); the cache tier this follows is `remote_cache.py`
- **Host ref**: [SPEC-037](037-two-tier-remote-cache-offload.md), [ARCH-034](../arch/034-video-lemmatization-cache.md)
- **Related**: [ADR-0023](../adr/0023-proxy-supabase-auth-through-flask.md) (Flask is the only gateway), [ADR-0043](../adr/0043-textbook-media-hosted-on-shared-host.md) (authored content stays public on `/data/`), [ADR-0046](../adr/0046-china-blocked-third-party-hosts.md) (no client-addressable storage host), [SPEC-041](041-delete-account.md) (account deletion), [SPEC-039](039-full-database-migration-supabase.md) (Supabase is the row store)

## Overview

The project needs somewhere to put files its users create: today a student's spoken
answer to a task; later profile images, attachments on a note, exported decks. None of
those are authored content, so none can live on the public `/data/` tree; none is a row,
so none fits in Supabase; and a client must never reach a storage backend directly
(ADR-0023, and `*.supabase.co` is TLS-filtered in mainland China per ADR-0046).

This spec defines one private store for all of them:

- **bytes** in a tree on the shared host, outside the web root, reachable only through
  PHP endpoints behind a dedicated key that only Flask holds;
- **metadata** in one `user_files` table, with the domain meaning carried by
  `kind` / `owner_type` / `owner_id` / `slot` rather than by a table per feature;
- **rules** per kind in a Flask registry: MIME allow-list, magic-byte check, byte cap,
  whether the kind replaces its slot or appends, and how it may be served.

Flask is the only client of the store. Browsers and apps upload to Flask, stream from
Flask, and never learn a host path, a key, or a URL that bypasses ownership checks.

The design exists so the second kind is a registry entry plus a client surface — not a
second table, endpoint family, retention rule and deletion path. [SPEC-111](111-task-data-sync-and-recordings.md)
is the first consumer and supplies the `task_recording` kind entry.

## Non-Goals

- **No sharing.** No public links, no teacher/staff access, no link expiry, no "anyone
  with the URL" mode. Owner-only is the only access rule.
- **No direct client → store path.** No signed host URLs, no CDN, no bucket
  credentials in a client.
- **No processing.** No transcoding, thumbnailing, speech-to-text, waveform analysis or
  virus scanning in v1.
- **No version history.** A kind either replaces its slot or appends; there is no
  revision list for a file.
- **No per-user quota in v1.** The plan's storage is unlimited (measured 2026-11-25:
  18 TB volume, 3.9 TB free); a per-kind byte cap plus one-live-file-per-slot is the
  bound.
- **No authored media.** Textbook audio and images stay on the public content tree
  (ADR-0043); this store is for user-created bytes only.
- **No client-side MIME trust.** The declared type is verified against magic bytes.
- **No soft-delete UI.** Deletion voids the row and removes the bytes; the metadata
  history stays for the owning feature.

## Goals and Acceptance Criteria

| # | Goal | Acceptance |
|---|---|---|
| G1 | Files are private by default | The tree is not web-reachable (`GET /zerothero-user-files/` → `404`); only Flask holds the key |
| G2 | Only the owner can read their bytes | An unauthenticated or other-user request is refused; every read resolves a `user_files` row for the caller first |
| G3 | One enforcement path per kind | MIME allow-list, magic bytes, byte cap and replace/append are applied once, from the registry; an unknown kind is rejected |
| G4 | Replace or append is a kind's decision, enforced in the database | `replaces_slot` kinds cannot end up with two live files for one slot (partial unique index); appending kinds are unconstrained |
| G5 | A large upload survives a bad connection | Uploads are 4 MiB parts with resume; parts are listed, assembled in order, verified by sha256 and swept when abandoned |
| G6 | Playback streams | `Range` requests return `206` with a correct `Content-Range`, relayed by Flask |
| G7 | Deletion is real | Replacing or deleting a file removes its bytes; account deletion removes the user's tree prefix |
| G8 | A second kind needs no new infrastructure | Adding a kind is a registry entry plus a client surface — no migration, no new endpoints, no new deletion path |
| G9 | Resources are bounded | A `Content-Length` over the cap is refused before the body is read; bodies stream to disk so `memory_limit` never binds |

## Current State (As-Built, Verified)

The store does not exist yet. What exists is the host tier it follows, and the absence
of any upload path in our applications:

- **The cache tier already lives on the same host and works under the same shape** — `save-flask-cache.php` / `load-flask-cache.php` / `delete-flask-cache*.php`, key-gated by `X-Cache-Key` via `hash_equals()` against `apikeys.json`, writing to a tree outside the web root with sanitised bucket/key segments (`SPEC-037`, `ARCH-034`). `save-flask-cache.php` uses `file_get_contents('php://input')` + temp-file rename; `load-flask-cache.php` has no `Range` support. Neither is suitable for user files: they share one credential with the cache, and their shape is cache-shaped (`bucket`/`key`, text payloads).
- **No upload path in our applications.** Flask has no `request.files`, no multipart handling and no `MAX_CONTENT_LENGTH`; no app constructs a `FormData`.
- **The host envelope has been measured** (PHP 8.3, § The measured host envelope) and the tree position has been proven private (`~/zerothero-user-files`, created 2026-11-25, `GET` → `404`).
- **Backup retention is known**: DreamHost keeps ~2 weeks of backups, not guaranteed (§ Privacy).

## Data Model

`supabase/migrations/202611240002_user_files.sql`.

### `public.user_files` — one table for every user-generated binary

Metadata only; the bytes are in the private store (§ User File Store). The
identity of a file is its owner plus a `kind`; the domain meaning of the file is
carried by `owner_type` / `owner_id` / `slot` rather than by columns per feature.

```sql
create table public.user_files (
  user_id         uuid   not null references auth.users(id) on delete cascade,
  file_id         text   not null,           -- client-generated stable id
  kind            text   not null,           -- 'task_recording' today; the policy key
  owner_type      text   not null,           -- 'task' today
  owner_id        text   not null,           -- task id today
  slot            text   not null default '',-- 'task' | blank id | item id
  storage_path    text   not null,           -- '<user_id>/<kind>/<file_id>.<ext>'
  mime            text   not null,           -- validated, as stored
  byte_size       integer not null,
  duration_ms     integer,                   -- client-reported, display only; never validated, never used for a decision
  live_key        text,                      -- '<kind>:<owner_type>:<owner_id>:<slot>' when the kind replaces
  created_at      bigint not null,           -- client clock, ms
  voided_at       bigint,                    -- replaced or deleted; never hard-deleted
  primary key (user_id, file_id)
);

-- "one live file per slot", generic: a kind either sets live_key (replaces) or leaves it null (appends)
create unique index user_files_live_key
  on public.user_files (user_id, live_key)
  where live_key is not null and voided_at is null;

create index user_files_owner on public.user_files (user_id, kind, owner_type, owner_id);
```

Why this shape:

- **`live_key` is the retention policy in the schema.** A replacing kind writes
  `task_recording:task:<task_id>:<slot>`, so re-recording cannot leave two live
  takes even if two uploads race — the loser gets a unique violation (`23505`) and
  the endpoint answers `409`. An appending kind leaves it `null` and is
  unconstrained. Voiding never clears `live_key`, because the index ignores voided
  rows; history keeps which slot a take belonged to.
- **`kind` is the policy key, not an enum in SQL.** Adding a kind must not require a
  migration; the valid set lives in Flask's registry (§ Policy registry).
- **Voided rows are kept.** They are the metadata history of a slot ("this task had
  a 74-second take before the current one"), which is what self-comparison and
  attempt history need; only the bytes are deleted.

### RLS and grants

```sql
alter table public.user_files enable row level security;
-- owner_select / owner_insert / owner_update / owner_delete, each
--   using ((select auth.uid()) = user_id)
grant select, insert, update, delete on public.user_files to authenticated;
```

Defence in depth, not the access path: clients never speak PostgREST (ADR-0023,
SPEC-039 decision 5) and Flask connects as its own role. It matters because
`SUPABASE_REQUIRE_APP_DB_ROLE` can pin Flask to a restricted role
(`utils_db_context.py:70-82`), and because a future client-side mistake should fail
closed.

## Store Layout

### Layout and keys

- Root on the shared host: `~/zerothero-user-files` — a **sibling of the public
  content tree**, outside the web root. Created 2026-11-25 (mode `0750`) and confirmed
  not web-reachable: `GET /zerothero-user-files/` → `404` and a probe file inside it →
  `404`, because the docroot exposes a directory only through a symlink and this tree
  has none. There is no `.htaccess` in the web root to override anything.
- Object key: `{user_id}/{kind}/{file_id}.{ext}`. The user prefix is what makes
  account deletion a known-set delete; `file_id` makes an upload idempotent and the
  bytes immutable (no overwrite in normal operation, so no cache invalidation).
- Extension comes from the validated MIME, never from the client's filename.

### PHP endpoints (new, in `zerothero-server`, deployed to the shared host)

Four endpoints, deliberately separate from the cache endpoints so the credential and
the failure domain are separate. All require `X-User-Files-Key` matched with
`hash_equals()` against `apikeys.json` (a new field, e.g. `filesKey`), and answer
`401 Unauthorized` otherwise. All path components are validated with the same
discipline the cache endpoints use: `user` = `[A-Za-z0-9-]{8,64}`, `kind` =
`[a-z0-9_]{1,32}`, `file` = `[A-Za-z0-9._-]{8,80}`; any component containing `..`
or a separator is rejected.

| Endpoint | Method | Contract |
|---|---|---|
| `save-user-file.php` | POST raw body + `?user=&kind=&file=` | writes `~/zerothero-user-files/{user}/{kind}/{file}`; temp file + `rename()` so a partial upload never becomes visible; `413` above the host ceiling; answers `OK` |
| `load-user-file.php` | GET/HEAD + same query | returns bytes (`200`) or `404`; honours `Range: bytes=start-end` with `206`, `Content-Range` and `Accept-Ranges: bytes`; answers `application/octet-stream` (Flask sets the client-facing type) |
| `delete-user-file.php` | DELETE + same query | `200 OK` or `404` |
| `delete-user-files-batch.php` | POST JSON `{"items":[{"user","kind","file"},…]}` (≤ 2 000) | deletes each, returns `{"deleted":n,"missing":n}` — the account-deletion path |
| `save-user-file-chunk.php` | POST raw body + `?user=&kind=&file=&index=` | writes `<file>.part<index>` atomically; `413` above the measured ceiling; answers `OK` |
| `list-user-file-chunks.php` | GET + same query | returns `{"received":[0,1,3]}` for resume |
| `complete-user-file.php` | POST JSON `{user,kind,file,total,byteSize,sha256}` | concatenates the parts in order **by streaming**, verifies size + sha256, deletes the parts, answers `OK`; `422` on mismatch (parts kept) |

The host ceiling in the write endpoints is a blunt guard set from the measured
envelope (512 MB body, 128 MB memory, 120 s — § The measured host envelope); the
per-kind cap in Flask is 32 MiB and is always lower. Every write streams the body
(`php://input` → temp file), never `file_get_contents`, so `memory_limit` never binds.

## Kind Rules

### Policy registry (Flask)

`zerotohero-python-server/utils_user_files.py` holds one entry per kind. Everything
kind-specific lives here: the allow-lists, the caps, and whether the kind replaces
its slot.

```python
@dataclass(frozen=True)
class FileKind:
    owner_types: tuple[str, ...]
    mimes: tuple[str, ...]
    magic: tuple[str, ...]       # verified against the bytes, not the filename
    max_bytes: int
    replaces_slot: bool          # True -> live_key, one live file per slot
    disposition: str             # 'inline' | 'attachment'

FILE_KINDS: dict[str, FileKind] = {
    'task_recording': ...        # registered by SPEC-111, the first consumer
}
```

**Kind entries are owned by the feature that introduces them**, not by this spec: the
store defines the mechanism and the enforcement, and each consumer registers its kind.
[SPEC-111](111-task-data-sync-and-recordings.md) § The `task_recording` kind is the
reference entry.

Rules the registry enforces, so a future kind cannot be sloppy:

- **MIME is verified, not trusted.** Magic bytes must match the declared container
  (WebM/EBML `1A 45 DF A3`, Ogg `OggS`, MP4 `ftyp`); a mismatch is `415`.
- **Bytes are the bound; duration is not a server rule.** The only resource a
  server must bound here is storage and request work, and both scale with bytes.
  A `duration_ms` the client sends is stored as display metadata and is never
  parsed, compared or enforced — so there is no container-duration code to write,
  test or get wrong, and a lying client gains nothing it could not already do by
  uploading to the byte cap. A duration limit belongs to the consumer that records
  the media, not here.
- **Only known kinds exist.** An unknown `kind` is `400`, not "stored with no policy".
- **Response headers are safe by construction.** `X-Content-Type-Options: nosniff`
  always; `Content-Disposition: inline` only for kinds whose policy allows it,
  `attachment; filename="<file_id>.<ext>"` otherwise. No kind may allow `text/html`,
  `image/svg+xml` or any script type — those would be an XSS vector served from our
  own origin.
- **`replaces_slot: True` computes `live_key`, `False` leaves it null.** The database
  enforces the former; the latter is append-only by having no key.

Documented future kinds (not implemented, listed so the registry shape is reviewed
against them): `user_avatar` (raster images, 1 MiB, replaces), `note_attachment`
(PDF/PNG/JPEG, 8 MiB, appends), `export` (zip, 64 MiB, appends, `attachment`
disposition).

### Upload protocol

`POST /files`, `multipart/form-data`: `file` plus `kind`, `ownerType`, `ownerId`,
`slot`, `fileId`, `durationMs` (media kinds only).

1. Authenticate, rate-limit, resolve the policy for `kind`, and check the kind allows
   `ownerType`.
2. Check `Content-Length` **before reading the body** and reject over `max_bytes`
   with `413`. This is the one check that must happen first: it is what keeps a
   hostile request from being buffered, and the measured host envelope below is
   only safe because of it.
3. Validate the declared MIME against the allow-list, stream the body to a temp file
   while counting bytes (see § The measured host envelope), verify the magic bytes
   on the head, and check `ownerId`/`slot` are within the id charset they become
   path segments for.
4. Write the object to the shared host with `X-User-Files-Key`
   (`save-user-file.php`). A `413` here is the host ceiling, not the policy cap.
5. In one transaction: compute `live_key`; if the kind replaces, void the previous
   live row for it; insert the `user_files` row; append the metadata change to
   `user_sync_log`.
6. Best-effort delete the voided row's object. A failure leaves an unreferenced
   object, which is harmless and swept later.

Idempotency has two halves, because a retry can interrupt at either step:

- **Row exists** for `fileId` → return it with `200`; nothing is re-uploaded.
- **Object exists, no row** (a crash between steps 4 and 5) → the retry writes the
  same key again (the endpoint overwrites atomically) and completes the row.

`409` is reserved for "another device won the slot". If step 5 fails, the object
written in step 4 is deleted in the error path, so a failed upload leaves no bytes.

### The measured host envelope (PHP 8.3, verified 2026-11-25)

The shared host serving `server.chinesezerotohero.com` was inspected over SSH rather
than assumed. The panel reports *Shared · Unlimited · iad1-shared-b7-13 · PHP 8.3*;
`/etc/php83/php.ini` is the effective base config, and `~/.php/8.3/phprc` contains
only `zend_extension=opcache.so` — **no per-domain overrides**:

| Limit | Value |
|---|---|
| `post_max_size` | 512 MB |
| `upload_max_filesize` | 512 MB (multipart only; we send a raw body) |
| `memory_limit` | **128 MB** |
| `max_execution_time` | 120 s |
| Apache `LimitRequestBody` | unset (unlimited; there is no `.htaccess` in the web root) |
| CDN / proxy in front | none — Apache directly, no `cf-ray` |
| Disk | 18 TB volume, 3.9 TB free |

Confirmed empirically: unauthenticated POSTs of 8 MB and 32 MB returned `401` in
14 s and 55 s — both accepted and handled by PHP, the second limited only by the
tester's uplink. A 30-minute take at 24 kbps is 5.2 MiB, so the host has an order of
magnitude of headroom over the 32 MiB policy cap.

Two consequences are load-bearing:

- **`memory_limit` 128 MB is the real ceiling**, and only if the script buffers the
  body. `file_get_contents('php://input')` (the pattern the cache endpoints use) holds
  the whole body in one string; the new endpoints must instead
  `stream_copy_to_stream(fopen('php://input','rb'), $tmp)` so memory stays flat at
  the chunk size. The `Content-Length` pre-check (step 2) is what makes that safe.
- **120 s is ample** for a 32 MiB write (tens of milliseconds locally); it is the
  *client's* uplink that makes a 30-minute take slow, which is why uploads are
  chunked (§ Long takes).

### Long takes: chunked, resumable upload

A 30-minute take is expensive to lose, and on a student's connection 5–32 MiB takes
tens of seconds to minutes. Uploading it as one request means a dropped connection
loses the whole take, and a closed browser tab loses it even earlier. So uploads are
chunked with resume, in Phase 1 (not deferred):

1. The client splits the file into **4 MiB parts** and `POST`s each to
   `POST /files/<file_id>/chunk?index=<n>&total=<N>` (raw body, `X-User-Files-Key`
   to the host). The host writes `pwrite`-style to `<file>.part<n>` — atomically via
   temp + rename, as the cache endpoint does.
2. `GET /files/<file_id>/chunks` returns the indices already received, so a resumed
   upload skips them instead of restarting.
3. `POST /files/<file_id>/complete` concatenates the parts in index order into the
   final object with `stream_copy_to_stream` (never into memory), verifies the
   declared `byteSize` and the client-sent `sha256`, deletes the parts, and only
   **then** runs the metadata transaction (step 5 above). A mismatch is `422`, and
   the parts are kept for a retry.
4. Parts older than 24 h are swept — an abandoned upload must not leak disk.

Two details that are easy to get wrong:

- **Parts are raw byte ranges of the finished file, not standalone containers.** A
  WebM recorded with `MediaRecorder` and `timeslice` emits chunks that concatenate
  into one stream (the header is in the first); the server must never try to parse a
  part on its own.
- **The web recorder should upload while recording** (`recorder.start(4000)` emits a
  `dataavailable` every 4 s → one part per emission). Then closing the tab loses at
  most the last part instead of the whole 30 minutes. Mobile records to a file first
  and chunks that file at upload time (`expo-audio` writes to disk; the uploader
  splits it).

Chunking is also what makes the byte cap *resumable*: the cap is checked once, on
the declared `byteSize` at `complete`, and per-part `Content-Length` keeps each
request small.

## Serving and Lifecycle

### Playback protocol

- `GET /files/<file_id>/url` → `{ url, expiresAt }`, TTL 300 s. The token is
  `HMAC-SHA256(file_id | user_id | exp, USER_FILES_TOKEN_SECRET)` in the query
  string, so a media element can seek without an auth header.
- `GET /files/<file_id>?t=…&exp=…` streams the object **through Flask**
  (`load-user-file.php` with `Range` forwarded), relaying `206`, `Content-Range`,
  `Content-Length` and `Accept-Ranges: bytes`. Location is
  `Cache-Control: private, max-age=0, must-revalidate` (a replaced take must not be
  served from a cache).
- Ownership is checked on every read: the row must exist for the authenticated user
  and be un-voided. Flask never asks the host for a path it did not read from a row.
- The shared-host URL, the key and the user id never reach the client.

### Replace, delete, retention

- **Replace (policy `replaces_slot`).** A new file voids the previous row, deletes its
  bytes and leaves the metadata history (time, size, duration if the kind records it).
  The `live_key` index guarantees one live file per slot.
- **Delete.** `DELETE /files/<file_id>` voids the row, deletes the object and logs a
  tombstone — the owner's delete control, and the only way bytes leave early.
- **No time-based expiry in v1.** Bounded by (one live file per slot × slots the owner
  used) for replacing kinds, and by `max_bytes` per file for appending kinds.
- **Account deletion.** `routes/auth.py` calls
  `utils_user_files.delete_all_for_user(user_id)` **before** deleting the GoTrue
  user: it reads the user's `user_files` rows, sends one `delete-user-files-batch.php`
  request, then lets the `on delete cascade` remove the rows. No cascade reaches the
  host, so this step is mandatory, and it must be in the deletion test.
- **Sweep.** Orphaned objects (upload written, row transaction failed; or a delete
  that failed) are found by comparing the tree against `user_files` over SSH. An
  operator script, run manually — not a cron.

## Privacy

The first kind holds a student's voice, which is personal data; the rules below are
the store's, and they apply to every kind:

- A file is stored for its owner only, on their own account, and is served to no one
  else — including staff.
- It is not transcribed, not sent to any model, not used for training, and not shared
  with anyone beyond our own host.
- The consumer's UI says where it went ("Saved to your account"), and the delete
  control sits next to the player, not buried in settings.
- Deleting the account deletes the bytes (§ Replace, delete, retention), and the
  privacy copy must list the kind of content explicitly when it ships.
- **Backup retention is now known**: DreamHost keeps ~2 weeks of backups and does not
  guarantee them, so the copy must say *deleted immediately from live storage; our
  host's backups may retain a copy for up to about two weeks* — never a bare "deleted".

## Cost

The store adds no line item: unlimited plan storage on a host the project already
pays for, no per-GB or egress charge (SPEC-037). A 30-minute take at 24 kbps is
5.2 MiB; a student who attempts every speaking slot in the pilot book (~6) at full
length with one take each is ≈ 31 MiB worst case, and a re-record replaces rather
than adds. Realistically most takes are 1–3 minutes, so ≈ 2–8 MiB per student per
book. The real cost is the PHP surface (a repository we cannot lint locally) and the
shared host's lack of SLA — both accepted in ADR-0053 rather than hidden.

For the record, what was given up by not using Supabase Storage: per-object policies,
signed URLs, `Range` for free, and metered quota. `Range` is re-implemented here; the
other three are covered by "Flask is the only client, and it checks ownership on every
read".

## API

All endpoints authenticate with the user's Supabase bearer JWT through
`utils_auth.authenticated_user_id()` and return `401` without one. New blueprint
`user_files_bp` (`routes/user_files.py`); helpers in `utils_user_files.py`.

| Method | Path | Purpose | Notes |
|---|---|---|---|
| POST | `/files` | Upload one file in a single request (declared `byteSize`, ≤ the kind's cap) | Short files; § Kind Rules |
| POST | `/files/<file_id>/chunk?index=&total=` | Upload one 4 MiB part | § Long takes |
| GET | `/files/<file_id>/chunks` | List received part indices | Resume |
| POST | `/files/<file_id>/complete` | Assemble parts, verify sha256 + size, then write the row | `422` keeps the parts |
| GET | `/files?ownerType=&ownerId=&kind=` | List live files for an owner | The generic read path |
| GET | `/files/<file_id>/url` | Short-lived playback/download URL | 300 s TTL |
| GET | `/files/<file_id>?t=&exp=` | Stream bytes, `Range` supported | Ownership checked; `206` on range |
| DELETE | `/files/<file_id>` | Void + delete bytes | Owner only |

Errors are the house style: `{ "error": "…" }` with a status, plus a machine code
where the client branches — `401` unauthenticated, `400 file_kind_unknown` /
`400 file_owner_invalid`, `413 file_too_large`, `415 file_type_mismatch`,
`409 file_slot_taken`, `422 file_hash_mismatch`, `429 file_rate_limited`,
`502 file_store_unavailable` (the shared host did not answer).

A consumer spec may add a shaped read (SPEC-111's `GET /tasks/state` returns this
table's metadata for its own tasks); it must not add a second upload, download or delete
path.

## Testing

- **Policy registry**: an unknown kind is `400`; every entry is well-formed (non-empty
  mimes/magic, `max_bytes > 0`, `disposition ∈ {inline, attachment}`,
  `replaces_slot` implies a slot); no entry may allow HTML/SVG/script.
- **Validation**: MIME/magic mismatch → `415`; `Content-Length` over the cap → `413`
  **before the body is read**; a path component containing `..` or a separator is
  rejected; a client-supplied `durationMs` is stored as-is and never affects
  accept/reject.
- **Ownership**: another user's `file_id` → `404`/`403`, never bytes; an expired or
  foreign token is refused; the token is bound to file **and** user.
- **Replace/append**: a second upload for a live `replaces_slot` slot → `409`; the
  voided file's bytes are gone; an appending kind can hold several live files for one
  owner.
- **Chunked upload**: parts out of order assemble correctly; a resumed upload skips
  `received` indices; sha256 mismatch → `422` with parts kept; `complete` twice is
  idempotent; abandoned parts are swept after 24 h.
- **Deletion**: `DELETE` removes row and bytes; `delete_all_for_user` issues one batch
  delete and leaves no rows.
- **Shared host (probe, not unit test)**: save → load → byte-compare → range request
  (`206`, correct slice) → delete → load `404`; `GET /zerothero-user-files/` → `404`; a
  wrong key → `401`; a 32 MiB upload succeeds and a 33 MiB one is refused before the
  body is read.

## Verification

### Confirmed on the host (2026-11-25, measured over SSH / HTTP)

| Item | Status | Evidence |
|---|---|---|
| The file tree is private | ✅ **confirmed** | `~/zerothero-user-files` created (mode `0750`); `GET /zerothero-user-files/` → **404** and a probe file inside it → **404**. Only docroot symlinks are public (`data -> ~/zerothero-server-data` serves `/data/` with 200; `cache` and `lemmatized-subs-cache` are symlinks too). The new tree has **no** symlink, and there is **no `.htaccess` in the web root**. |
| `Range` reaches the host | ◐ host side confirmed | A published mp3 answers `HTTP/2 206` with `accept-ranges: bytes`, `content-range: bytes 0-1023/129084`. Nothing strips `Range`. The remaining work is our `load-user-file.php` + the Flask relay. |
| Key plumbing | ◐ file shape confirmed | `apikeys.json` holds `cacheKey` (plus three unrelated keys) and **no `filesKey`**; the guard is `hash_equals()` over that file. Still to do: install `filesKey` + `USER_FILES_KEY`, then prove the two credentials are not interchangeable. |
| Backup retention | ✅ **confirmed** | DreamHost's docs: *"generally retains a 2-week backup … not guaranteed"* (§ Privacy). |
| PHP envelope | ✅ **confirmed** | PHP 8.3; `post_max_size` 512 MB, `upload_max_filesize` 512 MB, `memory_limit` 128 MB, `max_execution_time` 120 s; no per-domain overrides; no Apache body limit; no CDN (§ The measured host envelope). |
| Disk accounting | ❌ needs uploads | Plan storage unlimited; 18 TB volume, 3.9 TB free today. |

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| One key reads or writes the whole tree | Separate `X-User-Files-Key` (never the cache key), independent rotation, `401` on a wrong key, and every byte request resolves a `user_files` row for the caller first |
| Shared host down or slow | File operations fail with `502 file_store_unavailable`; the owning feature keeps its local copy and retries; the same host already backs images, textbooks and cache |
| PHP we cannot test locally | Small endpoints, reviewed line by line, proven by the save → load → range → delete probe before any client ships |
| A future kind serves an XSS payload | Per-kind MIME allow-list, magic-byte check, `nosniff`, `inline` only where the policy says so, no HTML/SVG/script in any allow-list |
| A 30-minute take is lost to a dropped connection | 4 MiB chunks with resume; parts kept 24 h; sha256 verified at assembly |
| Upload buffer exhausts PHP memory | `Content-Length` pre-check, stream `php://input` to disk, measured 128 MB `memory_limit` recorded |
| Abandoned uploads leak disk | Part sweep after 24 h; orphan-object sweep against `user_files` |

## Open Questions

1. **Which kind is second?** The registry shape is reviewed against `user_avatar`, `note_attachment` and `export`; picking one deliberately is what proves G8.
2. **Virus/malware scanning.** Not needed for audio-only in v1; it becomes a real question the moment a kind accepts PDFs or archives.
3. **Per-user quota.** Not enforced in v1; add a byte cap per user only if measured usage justifies it.
4. **Export.** A student cannot yet download all their files; a zip export is a separate feature.
5. **Off-site backup tier.** DreamHost's ~2-week retention is known; whether a separate off-site copy exists is a support question, not something we can read off the host.

## Dependencies

- **ADR-0053 (rev. 1–3)** — the storage decision this spec implements.
- **SPEC-037 / ARCH-034** — the cache tier on the same host: endpoint conventions, key handling, sanitisation, timeouts, and the "private tree outside the web root" fact this store relies on.
- **ADR-0043** — the contrast case: authored content is public on `/data/`; user files are private and never client-addressable.
- **ADR-0023 / ADR-0046** — Flask is the only gateway, and no client may reach a storage host directly.
- **SPEC-041** — account deletion, which must delete rows *and* objects.
- **SPEC-111** — first consumer: task responses/attempts sync, and the `task_recording` kind.

## Resolved Decisions (2026-11-25)

| Question | Decision |
|---|---|
| File backend | Private tree on the shared host, dedicated key and endpoints, Flask-only access |
| Abstraction | One `user_files` table + per-kind policy registry + `live_key`, not a table per feature |
| Credential | Separate `X-User-Files-Key`; never the cache key |
| Format | Store as recorded; no transcoding; MIME verified by magic bytes |
| Retention | Per-kind: replace the slot or append; no time-based expiry in v1 |
| Resumability | 4 MiB chunks with resume, sha256 at assembly, 24 h part sweep |
| Duration | **Not a store rule** — bytes are the bound; duration belongs to the consumer |
