# SPEC-111: Task Data Sync, User File Store and Student Recordings

## Metadata

- **Spec ID**: SPEC-111
- **Feature**: Server-side storage and cross-device sync for a student's textbook task data — responses, attempts, completion — plus a generic private **user file store** whose first kind is the student's own audio recordings for speaking tasks
- **Status**: draft — **design only, nothing implemented**. Every code change below is a plan, and none of it exists yet
- **Created**: 2026-11-24
- **ROADMAP Phase**: Phase 5 (Content Features)
- **Supersedes (in scope only)**: this spec replaces two statements in [SPEC-095](095-interactive-textbook.md) — the Non-Goal "Exercise state is local only" and the resolved decision "Attempt recording scope". The architectural decision behind the change is [ADR-0053](../adr/0053-task-data-sync-and-user-files.md) (revision 1), which supersedes [ADR-0044](../adr/0044-textbook-exercise-state-local-only.md) decision 3
- **Web ref**: `apps/web/src/components/textbook/task-provider.tsx`, `apps/web/src/app/[l1]/[l2]/tasks/…`, `apps/web/src/components/textbook/task-shell.tsx`
- **Mobile ref**: `apps/mobile/components/textbook/task-provider.tsx`, `apps/mobile/components/textbook/TaskView.tsx`, `apps/mobile/lib/sync-db.ts`, `apps/mobile/lib/sync-engine.ts`
- **Backend ref**: `zerotohero-python-server/routes/sync.py`, `utils_sync.py`, `routes/user_data_columns.py`, `utils_user_data.py`, `routes/auth.py`; the shared host's cache tier: `zerotohero-python-server/remote_cache.py`
- **Shared ref**: `packages/textbooks/src/store.ts` (`TaskResponseStore`, `PersistedTaskState`), `packages/textbooks/src/types.ts`, `packages/utils/src/sync-entities.ts`
- **Related**: [SPEC-037](037-two-tier-remote-cache-offload.md) (the cache tier on the host this reuses), [ARCH-034](../arch/034-video-lemmatization-cache.md) (its as-built detail), [SPEC-053](053-mobile-offline-mode.md) (sync engine), [SPEC-039](039-full-database-migration-supabase.md) (Supabase is the store, Flask is the gateway), [SPEC-066](066-srs-review-page.md) (the review-log shape this mirrors), [SPEC-041](041-delete-account.md) (account deletion), [ADR-0023](../adr/0023-proxy-supabase-auth-through-flask.md), [ADR-0040](../adr/0040-srs-sync-outbox-hardening.md), [ADR-0043](../adr/0043-textbook-media-hosted-on-shared-host.md), [ADR-0046](../adr/0046-china-blocked-third-party-hosts.md), [ADR-0034](../adr/0034-pro-gating-freemium-strategy.md)

## Overview

Today a student's task work exists only on the device that made it. Answers,
attempt outcomes and completion live in `localStorage` / `AsyncStorage` behind
`lp:textbook:` (ADR-0044), which means a task started on the web cannot be
finished on the phone, a cleared browser loses everything, and no one — the
student, a teacher, or the team — can see which exercises students actually get
wrong.

This spec adds the server copy and the sync, and it adds the one thing the
textbook currently cannot do at all: **record the student's own voice**. D ➐ of
the pilot unit asks a student to read their draft aloud into a recording; the app
today has no microphone path, so the authored content tells them the recording
happens elsewhere.

The audio is not modelled as a one-off. It is the first **kind** of a user file
store: an authenticated user's private bytes, with a per-kind policy for MIME
types, size, retention and deletion. Profile images, note attachments and exports
will need the same authorization, caps and deletion path, and building that once is
cheaper than building it four times.

Three properties shape the design:

1. **The device stays authoritative for the attempt in progress.** The local store
   already grades, resumes and completes a task with no network. Sync is a copy,
   never a precondition: a task must stay fully usable offline and signed out.
2. **Different state has different conflict rules.** A typed answer is
   last-write-wins *per blank*; a submitted attempt is an immutable fact; a file is
   replaced or appended according to its kind's policy. One table cannot serve all
   three without losing information.
3. **Bytes never take a client-addressable path.** Clients talk to Flask only
   (ADR-0023, AGENTS.md rule 5). Files live in a private tree on the shared host,
   outside the web root, behind a dedicated key that only Flask holds — and
   `*.supabase.co` is TLS-filtered in mainland China (ADR-0046), where this
   workbook's audience is, so no client-to-storage URL is possible anyway.

## User Stories

- As a student, I want to start a task on my laptop and finish it on my phone, so that switching devices does not cost me the work.
- As a student, I want my answers and results to survive clearing my browser or reinstalling the app, so that practice I paid attention to is not lost.
- As a student working through D ➐, I want to record myself reading my draft in the app, so that the "say it out loud" task is actually a task I can do here.
- As a student, I want to hear my recording again and replace it if it was bad, so that I can compare attempts.
- As a student, I want to delete a recording I do not want kept, so that I control a recording of my own voice.
- As a student with no signal, I want to keep working, so that the network is not the feature.
- As the product team, I want per-blank outcomes across users, so that "which blanks do students get wrong" is answerable.
- As an engineer, I want one file store with a policy per kind, so that the next user-generated binary does not re-invent authorization, retention and deletion.

## Non-Goals

Decided, not deferred:

- **No transcription, no pronunciation scoring, no AI feedback on recordings.** A recording is stored and played back; nothing reads it. Any scoring is a later decision with its own privacy review.
- **No SRS coupling.** Textbook performance still does not create review cards (ADR-0044 D5 stands).
- **No sharing.** No teacher dashboard, no class roster, no public link to a student's recording, no staff playback of individual recordings. Aggregated, non-identifying analytics may read attempt rows; files are served to their owner only.
- **No Pro gating of task data or files.** Pro gating stays content access (ADR-0044 D6). Storage is bounded by retention policy, not by plan.
- **No Classic (Nuxt) support.** `/tasks` does not exist in Classic (SPEC-095 scope note).
- **No per-device conflict UI.** Conflicts resolve by rule; where it matters the losing side is recoverable from the append-only attempt log.
- **No real-time collaboration or live push.** Sync happens on open/write/focus, not over websockets.
- **No image/video processing, thumbnailing or transcoding.** Bytes are stored as received.
- **No public host URLs.** No URL for the shared host ever leaves Flask.
- **No offline cache of uploaded files on mobile** in this spec; playback streams.
- **No quota UI and no per-user quota enforcement in v1.** The host has ~5.8 TB free; a per-kind byte cap plus one-live-file-per-slot is the bound. A total-per-user cap is added only if measurement says it is needed.

## Current State (As-Built, Verified)

### What exists

| Concern | Today | File |
|---|---|---|
| Web persistence | `localStorage` under `lp:textbook:<taskId>` | `apps/web/src/components/textbook/task-provider.tsx:43,76-98` |
| Mobile persistence | `AsyncStorage`, same prefix, read before mount | `apps/mobile/components/textbook/task-provider.tsx:34,43-61` |
| State shape | `{ taskId, contentVersion, responses, attempts }` | `packages/textbooks/src/store.ts:46-52` |
| Attempt log | append-only, `voidedAt` on the superseded entry | `packages/textbooks/src/store.ts:185-241` |
| Completion | derived: latest un-voided attempt has `result.complete` | `packages/textbooks/src/progress.ts` |
| Content version gate | a response saved under another `contentVersion` is discarded on load | `packages/textbooks/src/store.ts:110-113` |
| Hydration guard (web) | `pastHydration` via `useSyncExternalStore`; server HTML always renders unanswered | `apps/web/src/components/textbook/task-provider.tsx:61-67` |
| Durable outbox (mobile) | `sync.db` → `outbox` + `entity_cache`, `POST /sync/push` | `apps/mobile/lib/sync-db.ts`, `apps/mobile/lib/sync-engine.ts` |
| Durable queue (web) | SRS pending-op queue in `localStorage` (ADR-0040) | `apps/web/src/lib/srs-pending-queue.ts` |
| Push/pull endpoints | 200 ops per request, per-op savepoints, idempotency table, change log | `routes/sync.py:18,44`, `utils_sync.py:89-143` |
| Entity contracts | whole-row schema + domain `coalesce`, validated at enqueue | `packages/utils/src/sync-entities.ts` |
| Logout wipe | web: settings/SRS/saved words; mobile: notes, saved words, progress, SRS, `sync.db` | `apps/web/src/lib/user-data-wipe.ts:6-19`, `apps/mobile/lib/user-data-wipe.ts:33-56` |
| Private file tier | key-gated save/load/delete PHP endpoints over a tree outside the web root, used as the cache overflow | `zerotohero-python-server/remote_cache.py`, [SPEC-037](037-two-tier-remote-cache-offload.md), [ARCH-034](../arch/034-video-lemmatization-cache.md) |

### What does not exist

- **No upload path in our applications.** Flask has no `request.files`, no multipart handling and no `MAX_CONTENT_LENGTH`; no app constructs a `FormData`.
- **No user-file endpoints on the shared host.** The cache endpoints are cache-shaped (`bucket`/`key`, text payloads) and share one credential with the cache tier; they are not a user store.
- **No recording capability.** `expo-audio` / `expo-av` are not installed (mobile plays audio through `expo-video` to avoid a native rebuild — `apps/mobile/components/textbook/TaskAudio.tsx:19-27`), `MediaRecorder` appears nowhere in `apps/web`, and mobile's config explicitly **disables** the microphone permission (`apps/mobile/app.config.js:91-95`).

### Defects this spec has to fix on the way through

1. **Attempt ids are not unique across devices.** `` `${task.id}#${attemptSeq}` `` (`packages/textbooks/src/store.ts:195,228`) repeats on every device. Any server keyed on it collides the moment a student uses two devices.
2. **Task answers leak across accounts on a shared device.** Mobile's wipe deliberately keeps `lp:textbook:*` — *"it is device-local with no server copy, so wiping it would destroy the returning user's answers"* (`apps/mobile/lib/user-data-wipe.ts:3-11`) — and web's wipe list does not contain the prefix at all. So the next user to sign in on that device sees the previous user's drafts: the mobile task route loads them with `loadPersistedTask` (`apps/mobile/components/textbook/TaskView.tsx:50`), and `RecallCard` reads the same store on both platforms (`apps/web/src/components/textbook/recall-card.tsx:26`). Once the server holds the copy, the wipe becomes safe and must be added.
3. **Completion has no server representation**, because there is no server row — a derived property that must stay derived, not become a column.

## Goals and Acceptance Criteria

| # | Goal | Acceptance |
|---|---|---|
| G1 | Task responses sync per blank across devices | Answer b3 on web, open the same task on mobile, b3 shows the answer; two devices editing different blanks both keep their text |
| G2 | Attempts are recorded server-side exactly once | Submitting once produces one row; replaying the same queued op produces no second row; re-submitting voids the earlier row, never deletes it |
| G3 | Completion is derivable server-side | No `completed` column; the latest un-voided attempt's `result.complete` reproduces `taskProgress()` exactly |
| G4 | A re-authored task does not silently grade stale answers | Rows whose `content_version` differs from the task's are ignored on read, on both the local and server path |
| G5 | Offline work still works | Airplane mode: open, answer, submit, resume; the queue drains on reconnect with no user action and no lost answer |
| G6 | Signed-out use still works | A signed-out student gets the current local-only behaviour, with no failed requests and no prompt to sign in |
| G7 | A student can record, hear and replace themselves | Record ≤ 180 s mono, play it back with seeking, replace it; exactly one live file per task slot exists server-side at any time |
| G8 | Files are private to their owner | An unauthenticated or other-user request for the bytes is refused; no shared-host URL ever reaches a client; the tree is not reachable over the web |
| G9 | Deleting an account deletes its files | After account deletion, no object remains under that user's prefix and no `user_files` row survives |
| G10 | Nothing about the sync blocks rendering | The task page paints the same HTML it paints today; server state is adopted after hydration on web and after the route's existing async load on mobile |
| G11 | The store is reusable for a second kind | Adding a kind is a registry entry plus a client surface — no new table, no new endpoint family, no new deletion path |

## Content Model: Declaring a Recording

A recording is not a blank: it has no string answer, it is never graded, and it
belongs to a *slot* (the task as a whole, or one item). Modelling it as a blank
kind would force it through grading and the response map. So it is a **stimulus
kind**, alongside `audio` (which is a *given* recording to listen to):

```ts
/** A slot the student records into (SPEC-111). Never graded. */
export interface RecordStimulus {
  kind: 'record';
  /** Stable within the task: 'task' for the task-wide slot, or an item/blank id. */
  slotId?: string;
  /** Prompt shown above the control, in L2 (tokenized like other instructions). */
  prompt?: string;
  /** Server- and client-enforced cap. The workbook prints no length; ➏'s five short
   *  notes suggest a spoken answer of about a minute, so the default cap is 180 s. */
  maxDurationSec?: number;
}
```

- `slotId` defaults to `'task'`. The same stimulus can hang off a table row or a
  block, matching how `audio` is already declared at four levels
  (`audioTracksIn` in `packages/textbooks/src/types.ts:713`) — `recordingSlotsIn(task)`
  is the parallel helper, and the validator gains a rule that two `record` stimuli
  in one task cannot share a `slotId`.
- D ➐'s authored instruction is the workbook's own: *"按照你写的草稿，录一段介绍自己城市
  的公共交通的音频。"* The current note that *"neither app captures audio … the
  recording is out of band"* (`packages/textbooks/src/content/tblt-hsk4/u06/lesson-d.ts:405-415`)
  is **removed in Phase 2**, not before: until capture exists, telling the student
  to record elsewhere is the honest instruction.

## Data Model

Two migrations, split so the text half ships without the file store:

- `supabase/migrations/202611240001_user_task_data.sql` — `user_task_responses`, `user_task_attempts` (Phase 0)
- `supabase/migrations/202611240002_user_files.sql` — `user_files` (Phase 1)

Both follow the pattern `202610170001_affiliates_coupons.sql` established (real DDL
in `supabase/migrations/`, `user_id uuid references auth.users(id) on delete
cascade`), and the ownership arrays in
`202608200002_security_phase1_identity_shadow.sql` and
`202608200003_security_phase2_rls_policies.sql` are extended to cover the new
tables. This is the "where does user-data DDL live" decision ADR-0044 asked for:
new user-data tables go in a migration, and no further lazy runtime DDL is added.

### `public.user_task_responses`

One row per (user, task, blank) — the merge granularity, because two devices
editing different blanks of one task must both keep their work.

```sql
create table public.user_task_responses (
  user_id         uuid    not null references auth.users(id) on delete cascade,
  task_id         text    not null,          -- canonical id, e.g. 'tblt-hsk4.u06.D.t7'
  blank_id        text    not null,
  content_version integer not null,
  value           text    not null default '',
  updated_at      bigint  not null,          -- client clock, ms
  created_at      timestamptz not null default now(),
  primary key (user_id, task_id, blank_id)
);
```

`value` is `text`, not `jsonb`: every blank answer is already a string in
`responses: Record<string, string>` (`store.ts:48`), including free writing and
note cards.

### `public.user_task_attempts`

Append-only; the only mutable field is `voided_at`, mirroring
`public.user_srs_review_log` (SPEC-066), which is the shape ADR-0044 chose
precisely so it would survive this step.

```sql
create table public.user_task_attempts (
  user_id         uuid   not null references auth.users(id) on delete cascade,
  attempt_id      text   not null,           -- client-generated stable id (see below)
  task_id         text   not null,
  content_version integer not null,
  responses       jsonb  not null default '{}'::jsonb,  -- snapshot at submit
  result          jsonb,                     -- TaskResult, or null
  submitted_at    bigint not null,
  voided_at       bigint,
  created_at      timestamptz not null default now(),
  primary key (user_id, attempt_id)
);
create index on public.user_task_attempts (user_id, task_id, submitted_at desc);
```

- **`attempt_id` is the idempotency key** for `/sync/push`, so a replayed op can
  never mint a second attempt and two devices cannot collide. This replaces
  `` `${task.id}#${seq}` `` (`store.ts:195,228`) with an id created where the
  attempt is created, through an injected `newAttemptId?: () => string` on
  `TaskStoreOptions` — `packages/textbooks` stays platform-agnostic (AGENTS.md
  rule 1). Web passes `crypto.randomUUID()` (available in a secure context);
  mobile passes the existing Hermes-safe `makeSyncId()` (`Date.now()` + 8 base36
  chars, `apps/mobile/lib/sync-db.ts:51-53`, whose comment records that
  `crypto.randomUUID` is not guaranteed on Hermes); tests pass a counter. The
  server column is `text`, not `uuid`, because not every platform can mint one —
  uniqueness only has to hold per user, and the primary key is `(user_id, attempt_id)`.
- **Attempts created before this ships are not backfilled.** They carry `taskId#n`
  ids that would either collide or, if re-keyed per device, produce duplicate
  attempts from the same student. They stay in the local store only. Stated as a
  deliberate limitation: their information value is a handful of pilot tasks, and
  the alternative (re-keying) silently corrupts attempt analytics.
- **`result` is a snapshot, not a reference.** Grading is client-side (`gradeTask`),
  so the server cannot recompute a past attempt under new content; storing the
  `TaskResult` is the only faithful record.

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
  duration_ms     integer,                   -- media kinds only; display metadata
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
alter table public.user_task_responses enable row level security;
alter table public.user_task_attempts  enable row level security;
alter table public.user_files          enable row level security;
-- owner_select / owner_insert / owner_update / owner_delete, each
--   using ((select auth.uid()) = user_id)
grant select, insert, update, delete on
  public.user_task_responses, public.user_task_attempts, public.user_files
  to authenticated;
```

This is **defence in depth**, not the access path: clients never speak PostgREST
(ADR-0023, SPEC-039 decision 5) and Flask connects as its own role. It matters
because `SUPABASE_REQUIRE_APP_DB_ROLE` can pin Flask to a restricted role
(`utils_db_context.py:70-82`), and because a future client-side mistake should
fail closed.

### Why three tables

| State | Write pattern | Conflict rule | Wrong if merged |
|---|---|---|---|
| Responses | every keystroke (debounced) | per-blank LWW | Per-task LWW would discard the other device's work on unrelated blanks |
| Attempts | once per submit | immutable fact; voided by a later attempt | LWW would let a retried push overwrite or duplicate a past result |
| Files | one object per upload | kind policy: replace a slot, or append | Storing bytes in the response row would re-upload audio on every keystroke path |

## Sync Design

### Entities

Two new entities in `packages/utils/src/sync-entities.ts` (client contract) and
`zerotohero-python-server/utils_sync.py` (`_HANDLERS`, `_ENTITY_SCHEMAS`):

| Entity | Payload | Coalesce | Ops |
|---|---|---|---|
| `task_response` | `{ taskId: string, blankId: string, contentVersion: number, value: string, updatedAt: number }` | replace the same `(taskId, blankId)` op | upsert |
| `task_attempt` | `{ taskId: string, attemptId: string, contentVersion: number, responses: object, result: object\|null, submittedAt: number }` | replace (an op for one `attemptId` is unique) | upsert |

Entity id: `task_response` → `${taskId}#${blankId}`, `task_attempt` → `attemptId`.
Server-side, both handlers write the row and the change log entry in one
transaction — `log_change()` already does this for every other entity.

**Server write guards** (mirroring the SRS row API, which the outbox was hardened
against):

- `task_response` upsert is last-write-wins in SQL, not in Python:
  `on conflict (user_id, task_id, blank_id) do update set … where excluded.updated_at >= user_task_responses.updated_at`,
  and a write older than a tombstone for the same entity is refused with
  `stale_after_delete()` (`utils_sync.py:161-164`) — the guard that stops a queued
  offline write resurrecting deleted state.
- `task_attempt` upsert never updates an existing row's payload; it inserts, and
  first sets `voided_at = submitted_at` on the same task's un-voided rows. A
  replayed `attemptId` is caught by the primary key (or the idempotency table)
  before either step.
- A write that loses (older timestamp, stale after delete) returns
  `{ ok: true, dropped: true }`, the shape `_h_bookshelf` already uses, so the
  client can tell "already superseded" from "failed" and stop retrying.

### Files are not a push entity

An upload is a multipart request whose row insert is owned by that request. Letting
`/sync/push` write the same row would give it two writers, and a queued file
payload would put binary data through the change log. Instead:

1. the upload endpoint writes the object and the `user_files` row;
2. it appends a **metadata-only** change to `user_sync_log` under entity
   `user_file` (bytes never enter the log);
3. other devices learn about the file through the pull they already run, and fetch
   the bytes on demand from Flask.

`user_file` is therefore a **pull-only** entity: the client's merge path
(`mergeChange`, `sync-engine.ts:259-290`) is generic and needs no new code, and the
push path never sees it.

### Conflict rules

| Situation | Resolution |
|---|---|
| Two devices edit the same blank | Higher `updatedAt` wins (client clocks; the same basis the SRS store uses) |
| Two devices edit different blanks | Both kept — per-blank rows |
| Same attempt pushed twice (retry, replay, offline flush) | One row: primary key + `user_sync_ops` idempotency |
| Re-submit after a submit | Older attempt gets `voided_at`; both rows kept |
| Task re-authored (new `contentVersion`) | Rows are **ignored on read**, never deleted, so a revert to old content restores them |
| Two devices upload a file for the same slot | `live_key` unique index picks one; the loser receives `409` and keeps its local file, showing "a newer recording from another device is here" |
| Local answer newer than the server's | The local store already wins on the same device; the queued op still drains and pushes the newer value |
| Attribution (who is `user_id`) | Supabase JWT `sub` via `utils_auth.authenticated_user_id()`, as every other user-data route |

### What syncs, and what must not

| State | Syncs? | Notes |
|---|---|---|
| `responses` | yes | per blank |
| `attempts` | yes | append-only |
| completion | derived | no column |
| file bytes + metadata | yes | bytes via the upload endpoint; metadata via the log |
| `BlankSelectionStore` ("which blank the bank fills next") | **no** | UI cursor, meaningless on another device |
| audio playback position, mock-app panel memory | **no** | ephemeral (SPEC-095 States) |
| scroll position, transcript dialog open | **no** | ephemeral |

### Web client

- **Queue**: `apps/web/src/lib/task-sync-queue.ts`, modelled on
  `srs-pending-queue.ts` (ADR-0040): one `localStorage` key per user
  (`lp:task-sync:<userId>`), coalesced by entity id, flushed on enqueue
  (debounced), on `online`, on focus, and on task open. A failed flush keeps the
  queue; a `401` stops the flush and retries after the session refreshes rather
  than dropping ops (the ADR-0040 defect 2 lesson).
- **Read**: one request when a task opens —
  `GET /tasks/state?taskIds=<id>&taskIds=<recall task id>` — because D ➐'s
  `RecallCard` reads a *different* task's draft (`recall-card.tsx:26`), and the
  task's `carried` blanks (`B ➏` carrying `B ➎`'s pictures) read an earlier task's
  state too.
- **Adoption**: the provider keeps its current contract (`load` / `save` adapters
  in `task-provider.tsx:146-168`) and gains a second, asynchronous adoption step
  that runs **after** `pastHydration` is true: merge the server snapshot into the
  store, letting local values win when the local `updatedAt` is newer. Nothing is
  adopted during render, so the HTML stays unanswered and hydration cannot mismatch
  (the failure ADR-0044 documents).
- **Playback**: an `<audio>` element cannot send an `Authorization` header, so a
  short-lived URL is issued by Flask (§ Playback protocol).

### Mobile client

- Register the two entities in `sync-db.ts`'s outbox writers (same transaction as
  `entity_cache`), and register `task_*` in `sync-engine.ts`'s push path. The
  **pull** path needs no per-entity code: `mergeChange()` is generic
  (`sync-engine.ts:259-290`), so a new entity is applied by the existing merge.
- The task route already loads local state before mounting the provider
  (`TaskView.tsx:45-61`). The server read joins that same async step: local first,
  then server, so first paint is never blocked on the network.
- `expo-audio` is a **new native dependency** (recording has no `expo-video`
  equivalent), so Phase 3 needs a new development build
  (`docs/arch/028-local-development-runbook.md`) and a microphone usage string;
  `app.config.js:91-95` currently disables the permission deliberately and its
  comment must be updated with it.
- Logout wipe gains `lp:textbook:` (both apps) **once the server copy exists**.
  Mobile's wipe comment explains the current exception and must be rewritten, not
  just edited, so the reason is not lost.

### Signed-out behaviour

No queue, no requests, no prompts: the store behaves exactly as it does today. On
sign-in, if the local store holds answers for tasks the account has no row for,
they are adopted and queued (a student who practised anonymously keeps their work).
If the account already has a row, LWW decides per blank. This is the saved-words
anonymous-merge precedent (`lpSavedWordsAnonMerged`).

## User File Store

A private, per-user byte store on the shared host, with one policy per file kind.
Its first kind is `task_recording`; the design exists so the second kind is a
registry entry, not a new subsystem.

### Layout and keys

- Root on the shared host: `~/zerothero-user-files` — a **sibling of the public
  content tree**, outside the web root. Verified for the cache tree that this
  position is not web-reachable (`GET /zerothero-server-flask-cache/` → `404`); the
  same 404 must be confirmed for the new tree after the first deploy.
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

The host ceiling in `save-user-file.php` is a blunt guard (target 8 MiB) that must
be set from PHP's measured `post_max_size` / `memory_limit`; the per-kind caps in
Flask are the real policy and are always lower.

### Policy registry (Flask)

`zerotohero-python-server/utils_user_files.py` holds one entry per kind. Everything
kind-specific lives here: the allow-lists, the caps, and whether the kind replaces
its slot.

```python
FILE_KINDS = {
    'task_recording': FileKind(
        owner_types=('task',),
        mimes=('audio/webm', 'audio/ogg', 'audio/mp4', 'audio/m4a'),
        magic=('webm', 'ogg', 'mp4'),          # verified against the bytes, not the filename
        max_bytes=2 * 1024 * 1024,
        max_duration_ms=180_000,
        replaces_slot=True,                    # -> live_key, one live take per slot
        disposition='inline',                  # safe to play in place
    ),
}
```

Rules the registry enforces, so a future kind cannot be sloppy:

- **MIME is verified, not trusted.** Magic bytes must match the declared container
  (WebM/EBML `1A 45 DF A3`, Ogg `OggS`, MP4 `ftyp`); a mismatch is `415`.
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
2. Validate: declared MIME in the allow-list, `Content-Length` and the read bytes
   under `max_bytes`, magic bytes match, `durationMs` within `max_duration_ms` when
   the kind declares one, and `ownerId`/`slot` are within the id charset they become
   path segments for.
3. Write the object to the shared host with `X-User-Files-Key`
   (`save-user-file.php`). A `413` here is the host ceiling, not the policy cap.
4. In one transaction: compute `live_key`; if the kind replaces, void the previous
   live row for it; insert the `user_files` row; append the metadata change to
   `user_sync_log`.
5. Best-effort delete the voided row's object. A failure leaves an unreferenced
   object, which is harmless and swept later.

Idempotency has two halves, because a retry can interrupt at either step:

- **Row exists** for `fileId` → return it with `200`; nothing is re-uploaded.
- **Object exists, no row** (a crash between steps 3 and 4) → the retry writes the
  same key again (the endpoint overwrites atomically) and completes the row.

`409` is reserved for "another device won the slot". If step 4 fails, the object
written in step 3 is deleted in the error path, so a failed upload leaves no bytes.

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

- **Replace (policy `replaces_slot`).** Re-recording voids the previous row, deletes
  its bytes and leaves the metadata history (duration, time). The `live_key` index
  guarantees one live take per slot.
- **Delete.** `DELETE /files/<file_id>` voids the row, deletes the object and logs a
  tombstone — the student's delete control, and the only way bytes leave early.
- **No time-based expiry in v1.** Bounded by (one live file per slot × slots the
  student attempted) for recordings, and by `max_bytes` per file for any other kind.
- **Account deletion.** `routes/auth.py` calls
  `utils_user_files.delete_all_for_user(user_id)` **before** deleting the GoTrue
  user: it reads the user's `user_files` rows, sends one `delete-user-files-batch.php`
  request, then lets the `on delete cascade` remove the rows. No cascade reaches the
  host, so this step is mandatory, and it must be in the deletion test.
- **Sweep.** Orphaned objects (upload written, row transaction failed; or a delete
  that failed) are found by comparing the tree against `user_files` over SSH. An
  operator script, run manually — not a cron.

### Privacy

Voice is personal data, and the product must behave accordingly:

- The file is stored for the student's own playback only, on their own account, and
  is served to no one else — including staff.
- It is not transcribed, not sent to any model, not used for training, and not shared
  with anyone beyond our own host.
- The UI says where it went ("Saved to your account"), and the delete control sits
  next to the player, not buried in settings.
- Deleting the account deletes the bytes (§ Replace, delete, retention), and the
  privacy copy must list voice recordings explicitly when this ships.
- **Backup retention is an open question, not an assumption**: whether the host's
  backups keep a deleted recording, and for how long, must be established before the
  copy says "deleted".

### Cost

The store adds no line item: ~5.8 TB free on a host the project already pays for, no
per-GB or egress charge (SPEC-037). One 90-second take at 32 kbps is ≈ 350 KB; a
student who attempts every speaking slot in the pilot book (~6) with one take each is
≈ 2 MB, and a re-record replaces rather than adds. The real cost is the PHP surface
(a repository we cannot lint locally) and the shared host's lack of SLA — both
accepted in ADR-0053 rather than hidden.

For the record, what was given up by not using Supabase Storage: per-object policies,
signed URLs, `Range` for free, and metered quota. `Range` is re-implemented here; the
other three are covered by "Flask is the only client, and it checks ownership on every
read".

## API

All endpoints authenticate with the user's Supabase bearer JWT through
`utils_auth.authenticated_user_id()` and return `401` without one. New blueprints
`task_data_bp` (`routes/task_data.py`) and `user_files_bp` (`routes/user_files.py`);
helpers in `utils_task_data.py` / `utils_user_files.py`.

| Method | Path | Purpose | Notes |
|---|---|---|---|
| GET | `/tasks/state?taskIds=a&taskIds=b` | Read responses, attempts and file metadata for ≤ 20 tasks | Server is content-agnostic: it returns `content_version` per row and the client filters |
| POST | `/sync/push` | Enqueue-drain for `task_response` / `task_attempt` | Existing endpoint; new handlers |
| GET | `/sync/pull?cursor=` | Cross-device changes, including `user_file` tombstones | Existing endpoint |
| POST | `/files` | Upload one file (multipart) | § Upload protocol |
| GET | `/files?ownerType=&ownerId=&kind=` | List live files for an owner | The generic read path; `/tasks/state` is the task-shaped convenience |
| GET | `/files/<file_id>/url` | Short-lived playback/download URL | 300 s TTL |
| GET | `/files/<file_id>?t=&exp=` | Stream bytes, `Range` supported | Ownership checked; `206` on range |
| DELETE | `/files/<file_id>` | Void + delete bytes | Owner only |

**Why a read endpoint and not pull-only?** `GET /sync/pull` replays the user's whole
change history since a cursor — correct for rebuilding a local cache, wrong for
opening one task: a student who has used the app for a month would replay thousands
of ops to paint one page. `/tasks/state` answers "what are the current rows for these
two tasks", which is the only question the task page asks.

`GET /tasks/state` response shape:

```jsonc
{
  "responses": [
    { "taskId": "…", "blankId": "b3", "contentVersion": 3, "value": "地铁", "updatedAt": 1764000000000 }
  ],
  "attempts": [
    { "attemptId": "…", "taskId": "…", "contentVersion": 3,
      "responses": { "b1": "…" }, "result": { "complete": true, "correctCount": 4,
      "scoreableCount": 5, "blanks": [] }, "submittedAt": 1764000000000, "voidedAt": null }
  ],
  "files": [
    { "fileId": "…", "kind": "task_recording", "ownerType": "task", "ownerId": "…",
      "slot": "task", "mime": "audio/webm", "byteSize": 351232, "durationMs": 87000,
      "createdAt": 1764000000000 }
  ]
}
```

Errors are the house style: `{ "error": "…" }` with a status, plus a machine code
where the client branches — `401` unauthenticated, `400 file_kind_unknown` /
`400 file_owner_invalid`, `413 file_too_large`, `415 file_type_mismatch`,
`409 file_slot_taken`, `429 file_rate_limited`, `502 file_store_unavailable` (the
shared host did not answer).

## Data Flow

1. Student opens a task. Web: server-rendered HTML (unanswered). Mobile: route
   resolves the book and the local copy first.
2. The device store loads its own state and renders. Nothing waits on the network.
3. `GET /tasks/state` fetches this task — and the tasks it recalls or carries from —
   and the result is merged after hydration (web) / after the route's async load
   (mobile), local-newest winning per row.
4. Student answers. Each blank writes to the store, which persists locally and
   enqueues one coalesced `task_response` op per `(task, blank)`.
5. Submit grades locally (`gradeTask`), appends an attempt with a fresh id, voids the
   previous one, and enqueues a `task_attempt` op.
6. The queue drains through `/sync/push` (web: queued in `localStorage`; mobile:
   `sync.db` outbox). Retries are idempotent; offline simply defers.
7. Another device pulls the change on next open and shows the answer/attempt.
8. Speaking task: record → stop → upload (`POST /files`, kind `task_recording`) with
   a client-generated `fileId`; on success the player switches to the stored take. On
   failure the local file is kept and the upload is retried; the UI says "not saved
   yet" rather than pretending.
9. Playback resolves a short-lived Flask URL and streams with `Range`; another device
   learns about the take from `/sync/pull` and plays the same way.

## Components

### Shared (`packages/textbooks`, pure TS)

- `types.ts` — `RecordStimulus`, `RecordingSlot`.
- `store.ts` — injected `newAttemptId`, `AttemptRecord.id` becomes a client id; a
  merge entry point (`adoptServerState`) that applies remote rows under the same
  content-version rule.
- `recordings.ts` (new) — `recordingSlotsIn(task)`, `formatDuration(ms)`, cap
  constants. Pure functions only (AGENTS.md rule 1).
- `schema.ts` — validator rules: unique `slotId` per task, `record` only on
  speaking-ish task types, `maxDurationSec` bounds.

### Shared (`packages/utils`)

- `sync-entities.ts` — `task_response`, `task_attempt` definitions.

### Web (`apps/web`)

- `src/lib/task-sync-queue.ts` (new) — durable queue, modelled on `srs-pending-queue.ts`.
- `src/lib/task-sync-client.ts` (new) — `fetchTaskState`, `pushOps`.
- `src/lib/user-files-client.ts` (new) — `uploadFile`, `getFileUrl`, `deleteFile`,
  MIME negotiation for `MediaRecorder`.
- `src/components/textbook/task-provider.tsx` — async server adoption after
  `pastHydration`; keep the existing synchronous store contract.
- `src/components/textbook/record-field.tsx` (new) — `MediaRecorder` control:
  record/stop/preview/replace/delete, elapsed vs cap, permission states.
- `src/components/textbook/task-shell.tsx` — render `record` stimuli.
- `src/lib/user-data-wipe.ts` — wipe `lp:textbook:` and the task-sync queue.

### Mobile (`apps/mobile`)

- `lib/task-sync.ts` (new) — outbox writes for the two text entities, using
  `sync-db.ts`'s existing single-transaction writer.
- `lib/user-files-client.ts` (new) — upload, signed-URL fetch, delete; shares the
  request shape with web but not the code (AGENTS.md rule 3).
- `components/textbook/RecordField.tsx` (new) — `expo-audio` recorder + expo-video
  playback of the stored take.
- `components/textbook/task-provider.tsx` — server adoption in the existing async
  load; wipe `lp:textbook:` in `lib/user-data-wipe.ts`.
- `app.config.js` — `expo-audio` plugin with a microphone usage string; replace the
  comment that currently explains why the permission is off.

### Backend (`zerotohero-python-server`)

- `routes/task_data.py` (new) — task-state endpoint.
- `routes/user_files.py` (new) — upload, list, URL, stream, delete.
- `utils_task_data.py` (new) — row CRUD for the two task tables.
- `utils_user_files.py` (new) — policy registry, magic-byte checks, shared-host
  client (save/load/delete/batch), HMAC token issue/verify, per-user deletion.
- `utils_sync.py` — `_h_task_response`, `_h_task_attempt`, schemas, handlers.
- `routes/auth.py` — `delete_all_for_user()` before the GoTrue delete, and the new
  tables in the e2e cleanup list.
- `supabase/migrations/202611240001_user_task_data.sql`,
  `supabase/migrations/202611240002_user_files.sql`.

### Shared host (`zerothero-server`, separate repository — not in this monorepo)

- `save-user-file.php`, `load-user-file.php`, `delete-user-file.php`,
  `delete-user-files-batch.php`, plus a `filesKey` entry in `apikeys.json`. Reviewed
  here, deployed there; there is no PHP binary in this environment (`SPEC-099:784`),
  so they are proven by the round-trip probe in § Testing rather than by a local run.

### i18n

New keys, added through `scripts/add-translation-key.mjs` + `sync-translations.mjs`
(all 18 locales; never edit locale JSONs directly):

`task.record`, `task.recording`, `task.stop_recording`, `task.rerecord`,
`task.play_my_recording`, `task.delete_recording`, `task.recording_saved`,
`task.recording_upload_pending`, `task.recording_too_long`,
`task.recording_permission_denied`, `task.recording_mic_unavailable`,
`task.synced`, `task.sync_pending`, `task.sync_failed_retry`,
`task.recording_from_other_device`. Reuse `action.delete`, `msg.loading`,
`action.retry` if the CSV already has them — check before adding.

## States

- **Loading**: the task paints from local state immediately; a server read never
  introduces a spinner over an answerable task.
- **Signed out**: local-only behaviour, no sync affordance, no error.
- **Offline**: answers and grades work; queued ops show a subtle "will sync" marker
  on the task shell, never a blocking banner. Playing a stored take needs the network;
  a failure uses the inline retry the audio controls already have.
- **Sync failed**: the queue is kept, the marker says "not saved yet", and a retry is
  offered. Silence is not acceptable — a student must not believe their work is safe
  when it is not.
- **Permission denied / no microphone**: the record control explains how to enable
  it; the task remains completable, because the recording is not scored.
- **Too long**: recording stops at the cap with a notice; the take so far is offered
  for keeping.
- **Replaced from another device**: shows the newer take with a one-line notice; the
  local file is discarded only after the student sees the notice.
- **Deleted account / signed out**: local task state is wiped (the leak in § Defects),
  and nothing is left to restore.
- **Task re-authored**: server rows for the old version are not shown and not deleted;
  a content revert brings them back.
- **Store unavailable** (shared host down or slow): uploads and playback fail with
  `502 file_store_unavailable`, text sync is unaffected, and nothing is lost — the
  local file is kept and retried.

## Phasing

**Phase 0 — task data sync (no files).** `…0001_user_task_data.sql` (tables, indexes,
RLS, grants); `task_response` / `task_attempt` entities; `GET /tasks/state`;
client-generated attempt ids; web queue; mobile outbox; logout wipe fix;
account-deletion table list. Ships cross-device answers and attempt history.

**Phase 1 — the user file store (backend only).** PHP endpoints on the shared host +
`filesKey`; `…0002_user_files.sql`; policy registry; `POST/GET/DELETE /files`; HMAC
playback tokens plus `Range` passthrough; per-user deletion; the orphan sweep.
Verifiable with `curl` alone, including the private-tree 404 and the range probe.

**Phase 2 — web capture + D ➐ content.** `MediaRecorder` component, `record`
stimulus, validator rules, i18n keys, D ➐'s authored note corrected, translations
regenerated. First release where a student can complete the speaking task inside the
product.

**Phase 3 — mobile capture.** `expo-audio`, microphone permission, new development
build, recorder component, wipe parity. Requires a device build; not a web-only
release.

**Phase 4 — follow-ups (separate decisions).** A second kind (avatar, note
attachment), attempt analytics dashboards, optional "keep every take" for Pro,
transcription/pronunciation scoring, per-user export.

## Testing

- **Unit (shared)**: `newAttemptId` injection produces unique ids; server-state
  adoption respects content version and keeps the newer local value;
  `recordingSlotsIn` finds slots at every level; validator rejects duplicate `slotId`.
- **Backend — text**: handlers are idempotent (same op twice → one row, same
  response); void-on-re-submit keeps both rows; `GET /tasks/state` caps `taskIds`;
  RLS denies an `anon` read (run once with the anon key).
- **Backend — files**: policy registry rejects an unknown kind; MIME/magic mismatch →
  `415`; oversize → `413`; a `fileId` from another user → `404`/`403`, never bytes; a
  second upload for a live slot → `409`; delete voids and removes;
  `delete_all_for_user` issues one batch delete and leaves no rows; the URL token is
  bound to file **and** user and expires.
- **Shared host (probe, not unit test)**: save → load → byte-compare → range request
  (`206`, correct slice) → delete → load returns `404`; `GET /zerothero-user-files/`
  returns `404`; a request with a wrong key returns `401`.
- **Web components** (existing pattern: `task-audio.test.tsx`,
  `task-provider.test.tsx`): a saved server answer is adopted after hydration and
  never during the server render; a queued op survives a reload; offline submit
  queues and drains; recorder permission-denied state renders.
- **Mobile**: outbox row shape validated before enqueue (the ADR-0040 defect 1 class),
  pull applies `task_*` and `user_file` without new code, wipe removes `lp:textbook:`.
- **Manual matrix** (must be run, not assumed): desktop Chrome + Safari; iPhone
  Safari; Android Chrome; the mobile app on a device. Cross-device: answer on A, see
  it on B; submit on A, see the result on B; record on A, play on B; replace on B, see
  the notice on A; delete the account, confirm rows **and** objects are gone.

## Verification Before Implementation

These are unknowns this spec deliberately does not guess:

1. **PHP body-size ceiling on the host.** `post_max_size` / `memory_limit` are unknown
   and no cache key exists on this machine, so upload 1 / 2 / 5 MiB bodies from the VPS
   and record where the endpoint fails. Set the PHP ceiling from the measurement; keep
   the per-kind caps below it.
2. **The new tree is actually private.** After creating `~/zerothero-user-files`,
   confirm `GET /zerothero-user-files/` → `404` and that no `.htaccess` rule in the web
   root exposes it.
3. **`Range` works end to end** — PHP `206` with a correct `Content-Range`, and Flask
   relaying it unchanged, for both WebM and MP4.
4. **New key plumbing.** `apikeys.json` gains `filesKey`; the VPS env gains
   `USER_FILES_KEY`; a request with the cache key is rejected (`401`) and vice versa —
   the two credentials must not be interchangeable.
5. **Disk accounting.** `du -sh ~/zerothero-user-files` after the first hundred
   uploads, to confirm the per-student estimate and that the host's quota is not shared
   with the cache in a way that matters.
6. **Backup retention.** Ask the host (or read its backup policy) how long a deleted
   file survives in backups; this decides the privacy copy, not a code change.
7. **The id generator per platform.** Confirm `makeSyncId()` is reachable from the
   attempt and recording paths on mobile (it lives in `sync-db.ts`, no new dependency),
   and that web runs in a secure context so `crypto.randomUUID()` exists. If either
   fails, use the ms+random form on both sides — the columns are `text` precisely so the
   format is not a schema concern.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Voice data is personal; a leak is serious | Private tree outside the web root, separate key, Flask-only access, ownership checked on every read, no sharing, delete control, deletion on account close, privacy copy updated with the release |
| One key reads the whole tree | Separate `X-User-Files-Key` (never the cache key), rotation independent, `401` on a wrong key, and every byte request resolves a `user_files` row first |
| Shared host down or slow | Text sync is unaffected; file operations fail with `502 file_store_unavailable`; the local file is kept and retried; the same host already backs images, textbooks and cache, so this is a known dependency |
| A PHP change we cannot test locally | Four small endpoints, reviewed line by line, proven by the save → load → range → delete probe before any client code ships |
| A future kind serves an XSS payload | Per-kind MIME allow-list, magic-byte check, `nosniff`, `inline` only where the policy says so, and no kind may allow HTML/SVG/script types |
| Sync duplicates or loses a submit | Append-only attempts + primary key on `attemptId` + `user_sync_ops` idempotency |
| A stale device overwrites newer answers | Per-blank LWW by `updatedAt`; the attempt log preserves what was submitted |
| Server state breaks the web server render | Adoption only after `pastHydration` |
| Content re-authoring orphans answers | `content_version` on every row, ignored on read, never deleted |
| Uploads become a DoS vector | Per-kind byte cap, magic-byte check, rate limit, host-level ceiling, one-live-per-slot |
| Account deletion leaves bytes or sync-log rows | Explicit batch delete before the GoTrue delete, rows in the e2e cleanup list, and the deletion check in the manual matrix. `user_sync_log` has no FK cascade today — a pre-existing gap this work should close for the new entities at least |
| A new native dependency slips into a "docs only" release | Phase 3 is the only phase that needs a build; Phases 0–2 ship without one |
| Students believe local work is safe when it is not | Explicit "not saved yet" marker and retry, per § States |

## Open Questions

1. **Should a teacher ever hear a recording?** Out of scope now (Non-Goals), but it is the obvious next request and needs its own consent model.
2. **Keep every take, for Pro?** Deferred; the schema already allows it (voided rows keep metadata), so it is additive.
3. **Backup retention on the shared host** — unknown, and it gates what the privacy copy may claim (§ Privacy, Verification 6).
4. **Which kind is second?** The registry is shaped for avatar/attachment/export; picking the second one is what proves G11, and it should be chosen deliberately rather than assumed.
5. **Analytics reads.** Attempt rows make "which blanks are wrong" possible; who may query it, and does the admin console get a report? Not decided here.
6. **A per-user total cap** is not enforced in v1. If measurement (Verification 5) shows a student can exceed a few tens of MB, add a per-user byte cap rather than a per-file one.

## Dependencies

- **ADR-0053 (revision 1)** — this spec's governing decision: task state via Flask, user files in a private store on the shared host.
- **SPEC-037 / ARCH-034** — the cache tier on the same host: endpoint conventions, key handling, sanitisation, timeouts, and the "private tree outside the web root" fact this store relies on.
- **ADR-0040** — the web durable-queue pattern this copies, including its failure lessons.
- **SPEC-053** — the mobile outbox / `entity_cache` / `/sync/pull` engine the new entities plug into.
- **SPEC-039** — Supabase as the store, Flask as the only gateway.
- **SPEC-041** — account deletion, which must learn about `user_files` and the host tree.
- **SPEC-095** — the task/blank model and the content pipeline the `record` stimulus extends.
- **SPEC-066** — the append-only review-log shape the attempt table mirrors.
- **ADR-0046** — the China constraint that keeps every byte on a Flask-proxied path.
- **ADR-0043** — the contrast case: authored *content* media is public on `/data/`; user files are private and never client-addressable.
- **ADR-0034** — Pro gating remains content access, never a data allowance.

## Resolved Decisions (2026-11-24, revised 2026-11-25)

| Question | Decision |
|---|---|
| Scope of sync | Responses + attempts + completion + files (all user-visible task data) |
| In-progress drafts across devices | Yes — per-blank LWW, not per-task |
| Completion storage | Derived from the latest un-voided attempt; no column |
| Attempt identity | Client-generated stable id (UUID on web, `makeSyncId()` on mobile); legacy `task#n` attempts are not backfilled |
| File backend | Private tree on the shared host, dedicated key and endpoints, Flask-only access |
| File abstraction | One `user_files` table + per-kind policy registry + `live_key`, not a recordings table |
| Credential | Separate `X-User-Files-Key`; never the cache key |
| Audio format | Store as recorded (WebM/Opus, Ogg/Opus, MP4/AAC); no transcoding |
| Re-recording | Replaces: one live file per slot enforced by a partial unique index |
| Quota | Per-kind byte cap + one-live-per-slot; no per-user quota in v1 |
| Capture scope | Included, phased — server + sync first, web capture, then mobile capture |
| Docs | ADR-0053 (rev. 1) + this spec |
