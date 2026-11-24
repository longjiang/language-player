# ADR-0053 — Task responses, attempts and recordings sync through Flask; recordings live in a private Supabase Storage bucket

**Status:** Accepted (2026-11-24)
**See also:**
- [ADR-0044: Textbook exercise state is local-only](0044-textbook-exercise-state-local-only.md) — **superseded in part.** Its store shape, content-version rule and void semantics stand; only decision 3 ("no server table, endpoint or sync") is replaced here, exercising the escape hatch that ADR itself named: *"If server persistence is wanted later, it reuses the ADR-0040 outbox pattern and the same append-only + void + idempotency-key shape, and that is a separate decision."* This is that decision.
- [ADR-0040: Harden the web SRS sync outbox](0040-srs-sync-outbox-hardening.md) — the durable-pending-queue pattern the text entities reuse
- [ADR-0043: Serve textbook media from the shared host](0043-textbook-media-hosted-on-shared-host.md) — why *content* media and *user* media end up in different places
- [ADR-0023: Proxy Supabase Auth through Flask](0023-proxy-supabase-auth-through-flask.md) and [ADR-0046: No mainland-China-blocked host](0046-china-blocked-third-party-hosts.md) — the two reasons bytes never go client → Storage
- [SPEC-053: Mobile offline mode](../specs/053-mobile-offline-mode.md) — the `sync.db` outbox / `entity_cache` / `/sync/pull` engine extended here
- [SPEC-039: Full database migration](../specs/039-full-database-migration-supabase.md) — Supabase is the store; Flask is the only gateway
- [SPEC-095: Interactive textbook](../specs/095-interactive-textbook.md) — the feature whose Non-Goals this supersedes
- SPEC-111: Task data sync and student recordings — the implementation plan that follows this decision (its own file lands with it)

---

## Context

### The decision ADR-0044 recorded

On 2026-09-11 ADR-0044 decided that textbook exercise state — in-progress
responses, completion, attempt outcomes — lives **only** on the device:
`localStorage` on web, `AsyncStorage` on mobile. It recorded the reason (no
user-data DDL owner existed mid-migration, and reading position already had the
same accepted gap), it recorded the cost (**no cross-device sync**, no
server-side analytics, nothing recoverable if storage is cleared), and it
recorded an explicit escape hatch for a later decision. SPEC-095's Non-Goals
restated it as product, not phasing: *"There is no server-side exercise table,
no sync, and no cross-device continuity — and none is planned here."*

Two product requirements now contradict that, and both are ordinary
consequences of the feature growing:

1. **A student's answers should follow them between web and mobile.** A
   workbook is worked through across days and devices; a task started on a
   laptop and a task finished on a phone are one task, not two.
2. **One task requires the student to speak.** D ➐ of the pilot unit asks for a
   recording of the student introducing their city's public transport. Today
   the app cannot capture audio at all, so the task tells the student the
   recording is "out of band" — the workbook instruction is followed outside
   the product. That is a content limitation the product creates, not a
   pedagogical choice.

### As-built, verified rather than assumed

**Persistence is device-only and synchronous.**

- Web: `TEXTBOOK_STORAGE_PREFIX = 'lp:textbook:'` (`apps/web/src/components/textbook/task-provider.tsx:43`), `loadPersistedTask` / `savePersistedTask` over `window.localStorage`. The store is constructed synchronously in a `useMemo`; a `pastHydration` gate keeps the server-rendered HTML unanswered so React does not discard the tree (ADR-0044, "Resuming vs first paint").
- Mobile: the same prefix over `AsyncStorage` (`apps/mobile/components/textbook/task-provider.tsx:34`), loaded by the route **before** the provider mounts so the store can stay synchronous.
- `PersistedTaskState` = `{ taskId, contentVersion, responses, attempts }` (`packages/textbooks/src/store.ts:46-52`); `AttemptRecord` carries `id, taskId, contentVersion, responses, result, submittedAt, voidedAt`. `submit()` voids prior attempts and appends one (`:190-208`); `recordChecked()` appends a completion attempt with `result.complete = true` and no blanks (`:221-241`) — so **completion is already derived from attempts**, not stored separately.

**Attempt ids are not globally unique.** `AttemptRecord.id` is
`` `${this.task.id}#${this.attemptSeq}` `` (`store.ts:195`, `:228`). Two devices
resuming the same task both produce `tblt-hsk4.u06.A.t1#1`. Today that is
invisible because ids never leave the device; any server keyed on it would
collide on the first second device.

**There is no upload path anywhere.** Flask contains no `request.files`, no
multipart handling and no `MAX_CONTENT_LENGTH`; no app in the repo constructs a
`FormData`; `supabase/migrations/` creates no bucket and no code reads
`SUPABASE_SECRET_KEY` for Storage; `expo-audio` / `expo-av` are not installed
(mobile plays task audio through `expo-video`, deliberately, to avoid a native
rebuild — `apps/mobile/components/textbook/TaskAudio.tsx:19-27`). Web has no
recording component; `MediaRecorder` is used nowhere. Mobile's config
explicitly **disables** the microphone permission today
(`apps/mobile/app.config.js:91-95`).

**What already exists and should carry the weight:**

- `POST /sync/push` — durable outbox ops with per-op idempotency keys, savepoint isolation per op, `MAX_PUSH_OPS = 200` (`zerotohero-python-server/routes/sync.py:18,44`), handler registry `_HANDLERS` + `_ENTITY_SCHEMAS` (`utils_sync.py:365-384`), and a per-user change log `public.user_sync_log` written in the same transaction as the row (`utils_sync.py:89-113`).
- `GET /sync/pull?cursor=` — the same log as a pull stream with tombstones (`utils_sync.py:115-143`). Mobile already applies it generically into `entity_cache` (`apps/mobile/lib/sync-engine.ts:210-290`) with `mergeChange` doing timestamp merge and tombstone checks that are **entity-agnostic** — a new entity needs no pull code.
- Client payload contracts: `packages/utils/src/sync-entities.ts` (whole-row schema + `coalesce` per entity, validated at enqueue so a malformed op never reaches the server).
- Web precedent for a durable local queue without SQLite: the SRS pending-op queue hardened by ADR-0040 (`apps/web/src/lib/srs-pending-queue.ts`).
- `SUPABASE_SECRET_KEY` is already in the production environment (`.env`), and Flask already talks to Supabase with psycopg2 and, for Auth, over HTTP (ADR-0023). A Storage API call is one more authenticated HTTP call from the same process — not new infrastructure.

**Two constraints decide where the bytes may live.**

- **Clients never touch Supabase directly.** All user data goes through Flask (AGENTS.md rule 5, ADR-0023, SPEC-039 decision 3: *"PostgREST/RLS is not used during the migration — Flask uses the service-role key"*). A signed Storage URL handed to the browser is a client-to-Supabase path by another name.
- **`*.supabase.co` is unreachable from mainland China.** ADR-0046 measured it: TLS handshakes for `tfugoojrqybaoukgpqza.supabase.co` are reset on-path, while other hosts on the same edge IP complete. This is not a latency concern that a fallback fixes — a client-side Storage URL fails outright for the `l1=en / l2=zh` audience this workbook is written for. The same measurement is why GoTrue is proxied; Storage must be proxied for the same reason.

**The DDL-ownership objection in ADR-0044 no longer holds.** ADR-0044
rejected server tables partly because *"`supabase/migrations/` does not own the
SRS tables"*, so adding one meant first deciding where user-data DDL lives.
That decision now has a precedent in the repository:
`supabase/migrations/202610170001_affiliates_coupons.sql` creates user-owned
tables with `user_id uuid not null references auth.users(id) on delete cascade`
in a normal migration, and `202608200002_security_phase1_identity_shadow.sql` /
`202608200003_security_phase2_rls_policies.sql` define the ownership column and
the owner RLS policy shape. A new user-data table **can** be added the clean
way; it does not need the lazy runtime DDL that `user_srs_review_log` uses.

## Decision

**Task data — responses, attempts and recordings — is stored server-side and
synced across devices, with Flask as the only gateway and a private Supabase
Storage bucket for the bytes. Local storage stays the device's working copy.**

1. **Three tables, one per conflict semantics.** `user_task_responses` (one row
   per user + task + blank, last-write-wins), `user_task_attempts`
   (append-only, immutable except `voided_at`), `user_task_recordings`
   (append-only metadata with `voided_at`, one live take per slot). They are
   created in `supabase/migrations/` with `references auth.users(id) on delete
   cascade` and owner RLS policies, and the two security-migration table arrays
   are extended so new tables inherit the same baseline.
2. **Attempts keep ADR-0044's shape and gain a stable id.** A new attempt gets a
   client-generated UUID at creation; the old `taskId#seq` form is retired
   rather than migrated (no attempt has ever left a device, so there is nothing
   to migrate). The UUID is the idempotency key — replaying a push cannot mint a
   second attempt, and two devices cannot collide.
3. **Completion stays derived.** No completion table and no `completed` flag: the
   latest un-voided attempt's `result.complete` is the answer, exactly as the
   TOC and picker compute it locally today (`taskProgress` /
   `bookProgress` in `packages/textbooks/src/progress.ts`).
4. **Responses are per-blank last-write-wins.** Per blank, not per task: two
   devices editing different blanks of one task both keep their work. Rows carry
   the `content_version` they were written against, and a read drops rows whose
   version no longer matches — the same staleness rule the local store already
   applies (`store.ts:109-112`). Stale rows are ignored, not deleted, so
   reverting content does not destroy answers.
5. **Recording bytes go to one private Supabase Storage bucket,
   `task-recordings`, addressed only by Flask.** Object key
   `{user_id}/{task_id}/{recording_id}.{ext}`. No storage RLS policy is created
   for `anon` or `authenticated`, so the deny-by-default baseline denies every
   non-service-key client by construction. No signed URL ever reaches a client;
   playback is `GET /task/recordings/<recording_id>` streamed by Flask with
   `Range` support.
6. **One live take per (task, slot), enforced in the database.** A partial
   unique index on the un-voided row makes "re-record replaces" a constraint,
   not a convention; the previous take's bytes are deleted after the new row is
   committed (best-effort, with a sweep for the residue). Attempt history still
   records that an earlier take existed, which is what self-comparison needs.
7. **Bytes are stored as recorded — declared mime + extension, no transcoding.**
   The VPS has no ffmpeg and adding it would put CPU on the upload path; both
   containers that clients produce (WebM/Opus on Chromium/Android, MP4/AAC on
   Safari/iOS and from `expo-audio`) already play in the only two clients this
   product has. Mono and a small bitrate are requested client-side; a duration
   cap and a byte cap are enforced **server-side**, because a client-reported
   duration is not a limit.
8. **Text writes ride the existing durable path; byte writes get their own
   endpoint.** `task_response` and `task_attempt` become sync entities
   (`sync-entities.ts` + `_HANDLERS` + `_ENTITY_SCHEMAS`), so offline replay,
   idempotency and tombstones come for free. Recordings do **not**: an upload is
   a multipart request whose row insert is owned by that request, so the
   recording row has exactly one writer. The endpoint appends its change to
   `user_sync_log` so other devices learn about it through the pull they already
   do.
9. **Local storage remains the working copy; the network never blocks a task.**
   The store still reads and writes the device first, and the server is a
   reconciliation target. Offline keeps working — a task loads, answers, grades
   and resumes with no request — and the queue drains when the network returns.
   A signed-out student keeps the local-only behaviour ADR-0044 describes.
10. **Unchanged from ADR-0044:** textbook performance does not feed SRS (D5), and
    Pro gating is content access, never a per-attempt cap (D6). Recording
    storage is not a paid feature either; it is bounded by retention (decision
    6), not by a plan.

## Consequences

**Gains**

- A student's task work — answers, attempts, completion, recordings — follows
  them between web and mobile, and survives a cleared browser.
- D ➐ becomes a real speaking task in the product instead of an instruction to
  record elsewhere.
- Per-blank attempt outcomes become queryable server-side, so "which blanks do
  students get wrong" stops being impossible (ADR-0044 listed it as a
  consequence of local-only).
- The text half is close to free: the outbox, idempotency table, change log,
  pull merge and payload validation already exist and are already used by five
  entities.

**Costs and risks**

- **Storage is the first user-generated binary this project stores.** Free-plan
  quota is 1 GB, the bucket is not covered by any `on delete cascade`, and
  voice recordings are personal data. Account deletion must explicitly remove
  `{user_id}/` objects; `routes/auth.py`'s `user_tables` cleanup list must gain
  the three tables; the privacy copy must say what is stored and why.
- **A new native dependency.** Mobile cannot record without `expo-audio` and a
  microphone permission string, which means a new development build
  (`apps/mobile/app.config.js` currently disables the permission). Web needs
  none — `MediaRecorder` is available in every browser this app supports.
- **The gateway in front of Flask has an unmeasured request-body limit.** The
  stack sits behind an unidentified proxy (`docs/arch/029-production-deployment-runbook.md`
  § 11.4). A byte cap must be chosen from a measured limit, not guessed.
- **Web rendering gets a second hydration hazard.** Server-owned state must not
  be read during render for the same reason device state must not: the HTML is
  generated with no knowledge of it. The existing `pastHydration` seam handles
  it; a server fetch introduced *before* it would reintroduce the mismatch
  ADR-0044 already paid for.
- **Content versioning becomes load-bearing server-side too.** Re-authoring a
  shipped task without bumping its version orphans answers on both sides of the
  sync now, not just on one device.
- **Storage egress is now on the critical path of a speaking task.** Playback is
  proxied through the VPS, so a recording stream is Flask bandwidth; that is the
  price of the China constraint, not an oversight.

## Alternatives Considered

- **Keep it local-only (ADR-0044 as written).** Rejected: both requirements
  above are product requirements, not nice-to-haves, and D ➐ cannot be completed
  as authored without either capturing audio or telling the student to use
  another device.
- **Store the audio bytes in Postgres (`bytea` / large objects).** Rejected: it
  puts megabytes into the database and every backup, forces the API to
  implement `Range` itself for seeking, and costs more per byte than Storage.
  Small files do not make database blobs a good idea.
- **Store the bytes on the existing PHP shared host (ADR-0043's host).**
  Rejected: that host is *public by design* — its `data/` prefix is served to
  anyone and publishing is `rsync` — and it has no upload API, no per-user
  authorisation, no deletion path and no quota. It is the right home for
  authored content and exactly the wrong home for a child's voice recording.
- **Client → Supabase Storage with signed URLs.** Rejected twice over: it
  crosses the Flask-only boundary (ADR-0023, AGENTS.md rule 5) and it is
  measurably unreachable from mainland China (ADR-0046), i.e. it would be broken
  for the audience the pilot workbook targets.
- **Base64 the audio into a `task_attempt` payload / the sync log.** Rejected:
  `/sync/push` accepts 200 ops per request and `user_sync_log` is the **pull**
  stream every device replays — megabytes of audio would be re-sent to every
  device on every cursor advance.
- **Keep every take per slot.** Rejected for now: 3–4× the storage for history
  nobody has asked to browse. The metadata log keeps the fact and duration of
  earlier takes, so keeping their bytes can be added later as a Pro feature
  without a schema rewrite.
- **Transcode to a single format on upload.** Rejected: no ffmpeg on the host,
  CPU-per-upload, and both client formats already play back on both platforms.
- **Lazy runtime DDL instead of a migration.** Rejected: that pattern exists in
  `utils_user_data.py` for historical reasons; a new user-data table deserves the
  FK-cascade + RLS treatment the affiliates migration demonstrates, and the new
  table is exactly where ADR-0044's "where does user-data DDL live" doubt gets
  settled.
- **A separate completion table.** Rejected: completion is already an attempt
  (`result.complete`), and two sources for one boolean is how they drift.
