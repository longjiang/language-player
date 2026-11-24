# SPEC-111: Task Data Sync and Student Recordings

## Metadata

- **Spec ID**: SPEC-111
- **Feature**: Server-side storage and cross-device sync for a student's textbook task data — responses, attempts, completion — plus capture, upload and playback of the student's own audio recordings for speaking tasks
- **Status**: draft — **design only, nothing implemented**. Every code change below is a plan, and none of it exists yet
- **Created**: 2026-11-24
- **ROADMAP Phase**: Phase 5 (Content Features)
- **Supersedes (in scope only)**: this spec replaces two statements in [SPEC-095](095-interactive-textbook.md) — the Non-Goal "Exercise state is local only" and the resolved decision "Attempt recording scope". The architectural decision behind the change is [ADR-0053](../adr/0053-task-data-sync-and-recordings.md), which supersedes [ADR-0044](../adr/0044-textbook-exercise-state-local-only.md) decision 3
- **Governing decision**: [ADR-0053](../adr/0053-task-data-sync-and-recordings.md)
- **Web ref**: `apps/web/src/components/textbook/task-provider.tsx`, `apps/web/src/app/[l1]/[l2]/tasks/…`, `apps/web/src/components/textbook/task-shell.tsx`
- **Mobile ref**: `apps/mobile/components/textbook/task-provider.tsx`, `apps/mobile/components/textbook/TaskView.tsx`, `apps/mobile/lib/sync-db.ts`, `apps/mobile/lib/sync-engine.ts`
- **Backend ref**: `zerotohero-python-server/routes/sync.py`, `utils_sync.py`, `routes/user_data_columns.py`, `utils_user_data.py`, `routes/auth.py`
- **Shared ref**: `packages/textbooks/src/store.ts` (`TaskResponseStore`, `PersistedTaskState`), `packages/textbooks/src/types.ts`, `packages/utils/src/sync-entities.ts`
- **Related**: [SPEC-053](053-mobile-offline-mode.md) (sync engine), [SPEC-039](039-full-database-migration-supabase.md) (Supabase is the store, Flask is the gateway), [SPEC-066](066-srs-review-page.md) (the review log shape this mirrors), [SPEC-041](041-delete-account.md) (account deletion), [ADR-0023](../adr/0023-proxy-supabase-auth-through-flask.md), [ADR-0040](../adr/0040-srs-sync-outbox-hardening.md), [ADR-0043](../adr/0043-textbook-media-hosted-on-shared-host.md), [ADR-0046](../adr/0046-china-blocked-third-party-hosts.md), [ADR-0034](../adr/0034-pro-gating-freemium-strategy.md)

## Overview

Today a student's task work exists only on the device that made it. Answers,
attempt outcomes and completion live in `localStorage` / `AsyncStorage` behind
`lp:textbook:` (ADR-0044), which means a task started on the web cannot be
finished on the phone, a cleared browser loses everything, and no one — the
student, a teacher, or the team — can see which exercises students actually get
wrong.

This spec adds the server copy and the sync, and it adds the one thing the
textbook currently cannot do at all: **record the student's own voice**. D ➐ of
the pilot unit asks a student to read their draft aloud into a recording; the
app today has no microphone path, so the authored content tells them the
recording happens elsewhere. Both problems are solved by the same plumbing —
an account-scoped record of task state, plus a small private object store for
the audio — and both are decisions, not experiments (ADR-0053).

Three properties shape the design:

1. **The device stays authoritative for the attempt in progress.** The local
   store already grades, resumes and completes a task with no network. Sync is a
   copy, never a precondition: a task must stay fully usable offline and signed
   out.
2. **The three kinds of state have three different conflict rules.** A typed
   answer is last-write-wins *per blank*; a submitted attempt is an immutable
   fact; a recording is a replaceable object. One table cannot serve all three
   without losing information.
3. **Audio never touches a client-addressable Supabase endpoint.** Clients talk
   to Flask only (ADR-0023, AGENTS.md rule 5), and `*.supabase.co` is
   TLS-filtered in mainland China (ADR-0046) — where this workbook's audience
   is. Flask holds the only Storage credential.

## User Stories

- As a student, I want to start a task on my laptop and finish it on my phone, so that switching devices does not cost me the work.
- As a student, I want my answers and results to survive clearing my browser or reinstalling the app, so that practice I paid attention to is not lost.
- As a student working through D ➐, I want to record myself reading my draft in the app, so that the "say it out loud" task is actually a task I can do here.
- As a student, I want to hear my recording again and replace it if it was bad, so that I can compare attempts.
- As a student, I want to delete a recording I do not want kept, so that I control a recording of my own voice.
- As a student with no signal, I want to keep working, so that the network is not the feature.
- As the product team, I want per-blank outcomes across users, so that "which blanks do students get wrong" is answerable.
- As an engineer, I want one sync mechanism for all task data, so that retries, idempotency and offline replay are not reinvented per feature.

## Non-Goals

Decided, not deferred:

- **No transcription, no pronunciation scoring, no AI feedback on recordings.** A recording is stored and played back, nothing reads it. Any scoring is a later, separate decision with its own privacy review.
- **No SRS coupling.** Textbook performance still does not create review cards (ADR-0044 D5 stands).
- **No sharing.** No teacher dashboard, no class roster, no public link to a student's recording, no admin playback of individual recordings. Aggregated, non-identifying analytics may read attempt rows; audio is not served to anyone but its owner.
- **No Pro gating of task data or recordings.** Pro gating stays content access (ADR-0044 D6). Storage is bounded by retention, not by plan.
- **No Classic (Nuxt) support.** `/tasks` does not exist in Classic (SPEC-095 scope note).
- **No per-device conflict UI.** No merge chooser, no "which device wins" dialog. Conflicts resolve by rule (below) and the losing side is recoverable from the append-only attempt log where it matters.
- **No real-time collaboration or live push.** Sync is on open/write/focus, not websockets.
- **No offline caching of recordings on mobile** in this spec; audio is streamed (the expo-video / download caches are out of scope).

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

### What does not exist

- **No upload path anywhere.** Flask has no `request.files`, no multipart handling and no `MAX_CONTENT_LENGTH`; no app constructs a `FormData`.
- **No Storage bucket.** `supabase/migrations/` creates no bucket and no code reads `SUPABASE_SECRET_KEY` for Storage.
- **No recording capability.** `expo-audio` / `expo-av` are not installed (mobile plays audio through `expo-video` to avoid a native rebuild — `apps/mobile/components/textbook/TaskAudio.tsx:19-27`), `MediaRecorder` appears nowhere in `apps/web`, and mobile's config explicitly **disables** the microphone permission (`apps/mobile/app.config.js:91-95`).

### Defects this spec has to fix on the way through

1. **Attempt ids are not unique across devices.** `` `${task.id}#${attemptSeq}` `` (`packages/textbooks/src/store.ts:195,228`) repeats on every device. Any server keyed on it collides the moment a student uses two devices.
2. **Task answers leak across accounts on a shared device.** Mobile's wipe deliberately keeps `lp:textbook:*` — *"it is device-local with no server copy, so wiping it would destroy the returning user's answers"* (`apps/mobile/lib/user-data-wipe.ts:3-11`) — and web's wipe list does not contain the prefix at all. So the next user to sign in on that device sees the previous user's drafts: the mobile task route loads them with `loadPersistedTask` (`apps/mobile/components/textbook/TaskView.tsx:50`), and `RecallCard` reads the same store on both platforms (`apps/web/src/components/textbook/recall-card.tsx:26`). Once the server holds the copy, the wipe becomes safe and must be added.
3. **Completion has no server representation**, because there is no server row — a derived property that must stay derived, not become a column (below).

## Goals and Acceptance Criteria

| # | Goal | Acceptance |
|---|---|---|
| G1 | Task responses sync per blank across devices | Answer b3 on web, open the same task on mobile, b3 shows the answer; two devices editing different blanks both keep their text |
| G2 | Attempts are recorded server-side exactly once | Submitting once produces one row; replaying the same queued op produces no second row; re-submitting voids the earlier row, never deletes it |
| G3 | Completion is derivable server-side | No `completed` column; the latest un-voided attempt's `result.complete` reproduces `taskProgress()` exactly |
| G4 | A re-authored task does not silently grade stale answers | Rows whose `content_version` differs from the task's are ignored on read, on both the local and server path |
| G5 | Offline work still works | Airplane mode: open, answer, submit, resume; the queue drains on reconnect with no user action and no lost answer |
| G6 | Signed-out use still works | A signed-out student gets the current local-only behaviour, with no failed requests and no prompt to sign in |
| G7 | A student can record, hear and replace themselves | Record ≤ 180 s mono, play it back with seeking, replace it; exactly one live take per task slot exists server-side at any time |
| G8 | Recordings are private to their owner | An unauthenticated or other-user request for the bytes is refused; no signed Supabase URL ever reaches a client |
| G9 | Deleting an account deletes its recordings | After account deletion, no object remains under that user's prefix and no metadata row survives |
| G10 | Nothing about the sync blocks rendering | The task page paints the same HTML it paints today; server state is adopted after hydration on web and after the route's existing async load on mobile |

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
  is the parallel helper, and the asset validator gains a rule that two
  `record` stimuli in one task cannot share a `slotId`.
- D ➐'s authored instruction is the workbook's own: *"按照你写的草稿，录一段介绍自己城市的公共交通的音频。"* The current note that *"neither app captures audio … the recording is out of band"* (`packages/textbooks/src/content/tblt-hsk4/u06/lesson-d.ts:405-415`) is **removed in Phase 2**, not before: until capture exists, telling the student to record elsewhere is the honest instruction.

## Data Model

A migration — `supabase/migrations/202611240001_user_task_data.sql` — following
the pattern `202610170001_affiliates_coupons.sql` established (real DDL in
`supabase/migrations/`, `references auth.users(id) on delete cascade`), plus the
ownership arrays from `202608200002_security_phase1_identity_shadow.sql` and
`202608200003_security_phase2_rls_policies.sql` extended to cover the new
tables. The bucket arrives in a second migration in Phase 1
(`202611240002_task_recordings_bucket.sql`) so the text half ships without
Storage. This is the "where does user-data DDL live" decision ADR-0044 asked
for: new user-data tables go in a migration, and no further lazy runtime DDL is
added.

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
  uniqueness only has to hold per user, and the primary key is
  `(user_id, attempt_id)`.
- **Attempts created before this ships are not backfilled.** They carry
  `taskId#n` ids that would either collide or, if re-keyed per device, produce
  duplicate attempts from the same student. They stay in the local store only.
  Stated as a deliberate limitation: their information value is a handful of
  pilot tasks, and the alternative (re-keying) silently corrupts attempt
  analytics.
- **`result` is a snapshot, not a reference.** Grading is client-side
  (`gradeTask`), so the server cannot recompute a past attempt under new content;
  storing the `TaskResult` is the only faithful record.

### `public.user_task_recordings`

Metadata only — the bytes are in Storage (§ Recordings). One live take per slot:

```sql
create table public.user_task_recordings (
  user_id         uuid   not null references auth.users(id) on delete cascade,
  recording_id    text   not null,           -- client-generated stable id
  task_id         text   not null,
  slot_id         text   not null default 'task',
  content_version integer not null,
  storage_path    text   not null,           -- '<user_id>/<task_id>/<recording_id>.<ext>'
  mime            text   not null,           -- as recorded: audio/webm | audio/ogg | audio/mp4 | audio/m4a
  byte_size       integer not null,
  duration_ms     integer,                   -- client-reported, display only
  created_at      bigint not null,           -- client clock, ms
  voided_at       bigint,                    -- set when replaced or deleted
  primary key (user_id, recording_id)
);
-- "Re-record replaces" is a constraint, not a convention:
create unique index user_task_recordings_one_live_slot
  on public.user_task_recordings (user_id, task_id, slot_id)
  where voided_at is null;
```

A partial unique index makes the replace rule impossible to violate from any
code path, including two uploads racing: the loser gets a `23505` and the
endpoint answers `409`.

### RLS and grants

```sql
alter table public.user_task_responses  enable row level security;
alter table public.user_task_attempts   enable row level security;
alter table public.user_task_recordings enable row level security;
-- owner_select / owner_insert / owner_update / owner_delete, each
--   using ((select auth.uid()) = user_id)
grant select, insert, update, delete on
  public.user_task_responses, public.user_task_attempts, public.user_task_recordings
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
| Recordings | one object per slot | replace (old take voided) | Storing takes in the response row would re-upload audio on every keystroke path |

## Sync Design

### Entities

Two new entities in `packages/utils/src/sync-entities.ts` (client contract) and
`zerotohero-python-server/utils_sync.py` (`_HANDLERS`, `_ENTITY_SCHEMAS`):

| Entity | Payload | Coalesce | Ops |
|---|---|---|---|
| `task_response` | `{ taskId: string, blankId: string, contentVersion: number, value: string, updatedAt: number }` | replace the same `(taskId, blankId)` op | upsert |
| `task_attempt` | `{ taskId: string, attemptId: string, contentVersion: number, responses: object, result: object\|null, submittedAt: number }` | replace (an op for one `attemptId` is unique) | upsert |

Entity id: `task_response` → `${taskId}#${blankId}`, `task_attempt` →
`attemptId`. Server-side, both handlers write the row and the change log entry in
one transaction — `log_change()` already does this for every other entity.

**Server write guards** (mirroring the SRS row API, which the outbox was
hardened against):

- `task_response` upsert is last-write-wins in SQL, not in Python:
  `on conflict (user_id, task_id, blank_id) do update set … where excluded.updated_at >= user_task_responses.updated_at`,
  and a write older than a tombstone for the same entity is refused with
  `stale_after_delete()` (`utils_sync.py:161-164`) — the guard that protects a
  queued offline write from resurrecting deleted state.
- `task_attempt` upsert never updates an existing row's payload; it inserts,
  and first sets `voided_at = submitted_at` on the same task's un-voided rows.
  A replayed `attemptId` is caught by the primary key (or by the idempotency
  table) before either step.
- A write that loses (older timestamp, stale after delete) returns
  `{ ok: true, dropped: true }`, the shape `_h_bookshelf` already uses, so the
  client can tell "already superseded" from "failed" and stop retrying.

`task_recording` is **not** a push entity. An upload is a multipart request whose
row insert is owned by that request; letting `/sync/push` write the same row
would give it two writers. The upload endpoint appends a `user_sync_log` entry
with the metadata as its payload (bytes never enter the log), so other devices
learn about the take through the pull they already run.

### Conflict rules

| Situation | Resolution |
|---|---|
| Two devices edit the same blank | Higher `updatedAt` wins (client clocks; same basis the SRS store already uses) |
| Two devices edit different blanks | Both kept — per-blank rows |
| Same attempt pushed twice (retry, replay, offline flush) | One row: primary key + `user_sync_ops` idempotency |
| Re-submit after a submit | Older attempt gets `voided_at`; both rows kept |
| Task re-authored (new `contentVersion`) | Rows are **ignored on read**, never deleted, so a revert to old content restores them |
| Two devices upload a take for the same slot | Partial unique index picks one; the loser receives `409` and keeps its local file, showing "a newer recording from another device is here" |
| Local answer newer than the server's | The local store already wins on the same device; the queued op still drains and pushes the newer value |
| Attribution (who is `user_id`) | Supabase JWT `sub` via `utils_auth.authenticated_user_id()`, as every other user-data route |

### What syncs, and what must not

| State | Syncs? | Notes |
|---|---|---|
| `responses` | yes | per blank |
| `attempts` | yes | append-only |
| completion | derived | no column |
| recording bytes + metadata | yes | bytes via the upload endpoint |
| `BlankSelectionStore` ("which blank the bank fills next") | **no** | UI cursor, meaningless on another device |
| audio playback position, mock-app panel memory | **no** | ephemeral (`SPEC-095` States) |
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
  task's `carried` blanks (`B ➏` carrying `B ➎`'s pictures) read an earlier
  task's state too.
- **Adoption**: the provider keeps its current contract (`load` / `save` adapters
  in `task-provider.tsx:146-168`) and gains a second, asynchronous adoption step
  that runs **after** `pastHydration` is true: merge the server snapshot into the
  store, letting local values win when the local `updatedAt` is newer. Nothing is
  adopted during render, so the HTML stays unanswered and hydration cannot
  mismatch (the failure ADR-0044 documents).
- **Playback**: an `<audio>` element cannot send an `Authorization` header, so a
  short-lived URL is issued by Flask (§ API) — not by Supabase.

### Mobile client

- Register the two entities in `sync-db.ts`'s outbox writers (same transaction as
  `entity_cache`), and register `task_*` in `sync-engine.ts`'s push path. The
  **pull** path needs no per-entity code: `mergeChange()` is generic
  (`sync-engine.ts:259-290`), so a new entity is applied by the existing merge.
- The task route already loads local state before mounting the provider
  (`TaskView.tsx:45-61`). The server read joins that same async step: local
  first, then server, so first paint is never blocked on the network.
- `expo-audio` is a **new native dependency** (recording has no `expo-video`
  equivalent), so Phase 3 needs a new development build
  (`docs/arch/028-local-development-runbook.md`) and a microphone usage string;
  `app.config.js:91-95` currently disables the permission deliberately and its
  comment must be updated with it.
- Logout wipe gains `lp:textbook:` (both apps) **once the server copy exists**.
  Mobile's wipe comment explains the current exception and must be rewritten, not
  just edited, so the reason is not lost.

### Signed-out behaviour

No queue, no requests, no prompts: the store behaves exactly as it does today.
On sign-in, if the local store holds answers for tasks the account has no row
for, they are adopted and queued (a student who practised anonymously keeps their
work). If the account already has a row, LWW decides per blank. This is the
saved-words anonymous-merge precedent (`lpSavedWordsAnonMerged`).

## Recordings

### Capture

| Client | API | Container / MIME | Notes |
|---|---|---|---|
| Web, Chromium & Android | `MediaRecorder` (`getUserMedia({ audio: { channelCount: 1 } })`) | WebM/Opus (`audio/webm;codecs=opus`), or Ogg/Opus in Firefox | Pick with `MediaRecorder.isTypeSupported`; never assume |
| Web, Safari & iOS Safari | same | MP4/AAC (`audio/mp4`) | Safari cannot produce WebM; `MediaRecorder` is available from iOS 14.5 |
| Mobile, iOS & Android | `expo-audio` `useAudioRecorder` | M4A/AAC (`.m4a`) | `RecordingPresets`-derived options with `numberOfChannels: 1`, explicit `bitRate`; `directory: 'document'` so the OS cannot evict an unsynced take |

- **Mono and a small bitrate are requested, not trusted.** The server enforces
  the byte cap and the duration cap; a client can lie about both, and the only
  consequence must be a rejected upload.
- **Caps**: default `maxDurationSec = 180`, `TASK_RECORDING_MAX_BYTES = 2 MiB`
  (≈ 2.5 min of mono Opus at 32 kbps ≈ 600 KB; the cap is deliberate headroom).
  The bucket mirrors the byte cap with `file_size_limit`.
- **Permission**: requested at first record, never at launch; a denial is a
  stated state with a link to OS settings, not a silent dead button.
- **Interruptions**: a phone call or an audio-session reset ends the recording;
  whatever was captured is offered for keeping rather than discarded
  (`expo-audio` surfaces `mediaServicesDidReset`).

### Storage layout

- Bucket `task-recordings`, **private** (`public = false`), `file_size_limit =
  2 MiB`, `allowed_mime_types` = the four above. Created in the Phase 1 migration
  (`insert into storage.buckets (id, name, public, file_size_limit,
  allowed_mime_types) … on conflict (id) do nothing`). No `storage.objects`
  policy is granted to `anon` / `authenticated`; only the service key can read or
  write.
- Key: `{user_id}/{task_id}/{recording_id}.{ext}`. The user prefix is what makes
  account deletion a prefix delete; `recording_id` makes an upload idempotent and
  the bytes immutable (no overwrite, no cache invalidation).

### Upload protocol

`POST /tasks/recordings`, `multipart/form-data`: `file` plus `recordingId`,
`taskId`, `slotId`, `contentVersion`, `durationMs`.

1. Authenticate (`authenticated_user_id()`), rate-limit, and validate the
   declared mime against the allow-list, the byte size against the cap, and
   `taskId` / `slotId` against a token/charset allow-list (they become object
   path segments — never interpolate them unvalidated).
2. Verify magic bytes for the declared container (WebM/EBML `1A 45 DF A3`, Ogg
   `OggS`, MP4 `ftyp`), so a renamed file cannot land as `audio/mp4`.
3. Put the object with the service key: `POST {SUPABASE_URL}/storage/v1/object/task-recordings/{path}`.
4. In one transaction: void the previous live row for the slot, insert the new
   row, append the change to `user_sync_log`.
5. Best-effort delete of the voided row's object. A failure leaves an unreferenced
   object, which is harmless and swept later (below).

Idempotency has two halves, because a retry can interrupt at either step:

- **Row exists** for `recordingId` → return it with `200`; nothing is re-uploaded.
- **Object exists, no row** (a crash between steps 3 and 4) → the retry uploads
  with `x-upsert: true` to the same key and completes the row. `recordingId` is in
  the key, so the bytes can only ever be this take's own.

`409` is reserved for the "another device won the slot" case. If step 4 fails, the
object written in step 3 is deleted in the error path, so a failed upload leaves
no bytes behind.

### Playback protocol

- `GET /tasks/recordings/<recording_id>/url` → `{ url, expiresAt }`, TTL 300 s.
  The token is `HMAC-SHA256(recording_id | user_id | exp, TASK_MEDIA_TOKEN_SECRET)`
  in the query string, so a media element can seek without an auth header.
- `GET /tasks/recordings/<recording_id>?t=…&exp=…` streams the object through
  Flask with `Accept-Ranges: bytes`, `206` on `Range`, and
  `Cache-Control: private, max-age=0, must-revalidate`. `Range` passthrough
  matters: "listen to yourself again from the middle" is the normal gesture.
- The Supabase URL, the service key and the signed-in user's id never reach the
  client. The token is scoped to one recording and one user and expires.

### Replace, delete, retention

- **One live take per slot** (partial unique index). Re-recording voids the
  previous row and deletes its bytes; attempt history still shows that an
  earlier take existed, with its duration.
- `DELETE /tasks/recordings/<recording_id>` voids the row, deletes the object and
  logs the tombstone — the student's delete control, and the only way bytes leave
  early.
- **No time-based expiry in v1.** Bytes are bounded by (one take per slot × slots
  the student actually attempted), which is the cheapest correct answer. A
  per-user quota (`413 task_storage_full`) guards the shared bucket:
  `TASK_RECORDING_MAX_BYTES_PER_USER = 200 MiB`.
- **Sweep**: orphaned objects (upload succeeded, row transaction failed; or
  delete failed) are found by listing the `{user_id}/` prefix against the rows.
  A small operator script, run manually at first — not a cron.

### Privacy

Voice is personal data, and the product must behave accordingly:

- The recording is stored only for the student's own playback, on their own
  account, and is served to no one else — including staff.
- It is not transcribed, not sent to any model, not used for training, and not
  shared with third parties beyond the object store that holds the bytes.
- The UI says where it went ("Saved to your account"), and the delete control is
  next to the player, not buried in settings.
- Deleting the account deletes the bytes (below), and the privacy copy must list
  voice recordings explicitly when this ships.
- There is no region selection: the bytes live wherever the Supabase project
  lives. That is an accepted limitation of a single-region project, recorded here
  so it is a stated position rather than something a user discovers.

### Cost

At 32 kbps mono, one 90-second answer is ≈ 350 KB. A student who attempts every
speaking slot in the pilot book (~6) with one take each is ≈ 2 MB; a re-record
replaces rather than adds. Supabase Storage is $0.0213/GB-month above the plan
quota (Free 1 GB, Pro 100 GB — verify which plan this project is on before
enabling uploads). Egress is Flask bandwidth because playback is proxied; that is
the price of the China constraint (ADR-0046), not an oversight.

## API

All endpoints authenticate with the user's Supabase bearer JWT through
`utils_auth.authenticated_user_id()` and return `401` without one. New blueprint
`task_data_bp` in `zerotohero-python-server/routes/task_data.py`; helpers in
`utils_task_data.py`.

**Why a read endpoint and not pull-only?** `GET /sync/pull` replays the user's
whole change history since a cursor — correct for rebuilding a local cache, wrong
for opening one task: a student who has used the app for a month would replay
thousands of ops to paint one page. `/tasks/state` answers "what are the current
rows for these two tasks", which is the only question the task page asks.

| Method | Path | Purpose | Notes |
|---|---|---|---|
| GET | `/tasks/state?taskIds=a&taskIds=b` | Read responses, attempts and recording metadata for ≤ 20 tasks | Server stays content-agnostic: it returns `content_version` per row and the client filters |
| POST | `/sync/push` | Enqueue-drain for `task_response` / `task_attempt` | Existing endpoint; new handlers |
| GET | `/sync/pull?cursor=` | Cross-device changes, including `task_recording` tombstones | Existing endpoint |
| POST | `/tasks/recordings` | Upload one take (multipart) | § Upload protocol |
| GET | `/tasks/recordings/<recording_id>/url` | Short-lived playback URL | 300 s TTL |
| GET | `/tasks/recordings/<recording_id>?t=&exp=` | Stream bytes, `Range` supported | Only Flask-issued tokens accepted |
| DELETE | `/tasks/recordings/<recording_id>` | Void + delete bytes | Owner only |

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
  "recordings": [
    { "recordingId": "…", "taskId": "…", "slotId": "task", "contentVersion": 3,
      "mime": "audio/webm", "byteSize": 351232, "durationMs": 87000,
      "createdAt": 1764000000000 }
  ]
}
```

Errors are the house style: `{ "error": "…" }` with a status, plus a machine code
where the client branches — `401` unauthenticated, `413 task_recording_too_large`,
`415 task_recording_type`, `409 task_recording_slot_taken`,
`429 task_recording_rate_limited`, `413 task_storage_full`.

## Data Flow

1. Student opens a task. Web: server-rendered HTML (unanswered). Mobile: route
   resolves the book and the local copy first.
2. The device store loads its own state and renders. Nothing waits on the network.
3. `GET /tasks/state` fetches this task — and the tasks it recalls or carries from —
   and the result is merged after hydration (web) / after the route's async load
   (mobile), local-newest winning per row.
4. Student answers. Each blank writes to the store, which persists locally and
   enqueues one coalesced `task_response` op per `(task, blank)`.
5. Submit grades locally (`gradeTask`), appends an attempt with a fresh id,
   voids the previous one, and enqueues a `task_attempt` op.
6. The queue drains through `/sync/push` (web: queued in `localStorage`; mobile:
   `sync.db` outbox). Retries are idempotent; offline simply defers.
7. Another device pulls the change on next open and shows the answer/attempt.
8. Speaking task: record → stop → upload (`POST /tasks/recordings`) with a
   client-generated `recordingId`; on success the player switches to the uploaded
   take. On failure the local file is kept and the upload is retried from the
   queue; the UI says "not saved yet" rather than pretending.
9. Playback resolves a short-lived Flask URL and streams with `Range`.

## Components

### Shared (`packages/textbooks`, pure TS)

- `types.ts` — `RecordStimulus`, `RecordingSlot`.
- `store.ts` — injected `newAttemptId`, `AttemptRecord.id` becomes a client id; a
  merge entry point (`adoptServerState`) that applies remote rows under the
  same content-version rule.
- `recordings.ts` (new) — `recordingSlotsIn(task)`, `formatDuration(ms)`, cap
  constants. Pure functions only (AGENTS.md rule 1).
- `schema.ts` — validator rules: unique `slotId` per task, `record` only on
  speaking-ish task types, `maxDurationSec` bounds.

### Shared (`packages/utils`)

- `sync-entities.ts` — `task_response`, `task_attempt` definitions.

### Web (`apps/web`)

- `src/lib/task-sync-queue.ts` (new) — durable queue, modelled on `srs-pending-queue.ts`.
- `src/lib/task-sync-client.ts` (new) — `fetchTaskState`, `pushOps`,
  `uploadRecording`, `deleteRecording`, `getPlaybackUrl`.
- `src/components/textbook/task-provider.tsx` — async server adoption after
  `pastHydration`; keep the existing synchronous store contract.
- `src/components/textbook/record-field.tsx` (new) — `MediaRecorder` control:
  record/stop/preview/replace/delete, elapsed vs cap, permission states.
- `src/components/textbook/task-shell.tsx` — render `record` stimuli.
- `src/lib/user-data-wipe.ts` — wipe `lp:textbook:` and the task-sync queue.

### Mobile (`apps/mobile`)

- `lib/task-sync.ts` (new) — outbox writes for the two entities, using
  `sync-db.ts`'s existing single-transaction writer.
- `components/textbook/RecordField.tsx` (new) — `expo-audio` recorder +
  expo-video playback of the uploaded take.
- `components/textbook/task-provider.tsx` — server adoption in the existing
  async load; wipe `lp:textbook:` in `lib/user-data-wipe.ts`.
- `app.config.js` — `expo-audio` plugin with a microphone usage string;
  replace the comment that currently explains why the permission is off.

### Backend (`zerotohero-python-server`)

- `routes/task_data.py` (new) — the task-state and recording endpoints.
- `utils_task_data.py` (new) — row CRUD, Storage calls (upload stream, signed
  read, delete), HMAC token issue/verify, quota check.
- `utils_sync.py` — `_h_task_response`, `_h_task_attempt`, schemas, handlers.
- `routes/auth.py` — recording cleanup on account deletion, and the three tables
  in the e2e cleanup list.
- `supabase/migrations/202611240001_user_task_data.sql` — tables, indexes, RLS,
  grants. `…0002_task_recordings_bucket.sql` (Phase 1) — the private bucket.

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
- **Offline**: answers and grades work; queued ops show a subtle "will sync"
  marker on the task shell, never a blocking banner. Recording playback needs the
  network (recorded bytes are local until uploaded, then streamed), so an
  offline playback of an uploaded take fails with the same inline retry the audio
  controls already have.
- **Sync failed**: the queue is kept, the marker says "not saved yet", and a
  retry is offered. Silence is not acceptable — a student must not believe their
  work is safe when it is not.
- **Permission denied / no microphone**: the record control explains how to
  enable it; the task remains completable, because the recording is not scored.
- **Too long**: recording stops at the cap with a notice; the take so far is
  offered for keeping.
- **Replaced from another device**: shows the newer take with a one-line notice;
  the local file is discarded only after the student sees the notice.
- **Deleted account / signed out**: local task state is wiped (the leak in
  § Defects), and nothing is left to restore.
- **Task re-authored**: server rows for the old version are not shown and not
  deleted; a content revert brings them back.

## Phasing

**Phase 0 — task data sync (no audio).** `…0001_user_task_data.sql` (tables, indexes, RLS, grants — no bucket yet);
`task_response` / `task_attempt` entities; `GET /tasks/state`; client-generated
attempt ids; web queue; mobile outbox; logout wipe fix; account-deletion table
list. Ships cross-device answers and attempt history.

**Phase 1 — recording storage (backend only).** `…0002_task_recordings_bucket.sql`
(bucket + limits), `POST/GET/DELETE /tasks/recordings`, HMAC playback tokens,
quota, retention-on-replace, account-deletion sweep. Verifiable with `curl`
alone.

**Phase 2 — web capture + D ➐ content.** `MediaRecorder` component, `record`
stimulus, validator rules, i18n keys, D ➐'s authored note corrected, translations
regenerated. First release where a student can complete the speaking task inside
the product.

**Phase 3 — mobile capture.** `expo-audio`, microphone permission, new
development build, recorder component, wipe parity. Requires a device build; not
a web-only release.

**Phase 4 — follow-ups (separate decisions).** Attempt analytics dashboards,
optional "keep every take" for Pro, transcription/pronunciation scoring,
per-user export.

## Testing

- **Unit (shared)**: `newAttemptId` injection produces unique ids; server-state
  adoption respects content version and keeps the newer local value;
  `recordingSlotsIn` finds slots at every level; validator rejects duplicate
  `slotId`.
- **Backend**: handlers are idempotent (same op twice → one row, same response);
  void-on-re-submit keeps both rows; the partial unique index rejects a second
  live take; upload rejects oversize, wrong magic bytes, disallowed mime,
  bad `taskId`, and a token issued for another user; `Range` returns `206` with
  the right slice; `GET /tasks/state` caps `taskIds`; RLS denies an `anon` read
  (run once with the anon key).
- **Web components** (existing pattern: `task-audio.test.tsx`, `task-provider.test.tsx`):
  a saved server answer is adopted after hydration and never during the server
  render; a queued op survives a reload; offline submit queues and drains;
  recorder permission-denied state renders.
- **Mobile**: outbox row shape validated before enqueue (the ADR-0040 defect 1
  class), pull applies `task_*` without new code, wipe removes `lp:textbook:`.
- **Manual matrix** (must be run, not assumed): desktop Chrome + Safari; iPhone
  Safari; Android Chrome; the mobile app on a device. Cross-device: answer on A,
  see it on B; submit on A, see the result on B; record on A, play on B; replace
  on B, see the notice on A; delete the account, confirm the objects are gone.

## Verification Before Implementation

These are unknowns this spec deliberately does not guess:

1. **Gateway body limit.** The production stack sits behind an unidentified
   proxy (`docs/arch/029-production-deployment-runbook.md` § 11.4). POST 1 / 2 /
   5 MB bodies to a throwaway authenticated endpoint and record where it fails;
   the byte cap (2 MiB) is chosen to fit under any plausible default, and must be
   re-checked if raised.
2. **Supabase plan and Storage quota** (`Free = 1 GB`, `Pro = 100 GB`). Check the
   dashboard before enabling uploads, and set the per-user quota from it.
3. **`storage.buckets` columns** in this project accept `file_size_limit` and
   `allowed_mime_types` (they do on current Storage versions; confirm against the
   project before the migration is applied).
4. **The deployed DB role.** Confirm Flask can still write the new tables when
   `SUPABASE_REQUIRE_APP_DB_ROLE` is on, and that the owner policies do not
   block the backend's own reads.
5. **The id generator per platform.** Confirm `makeSyncId()` is available to the
   attempt and recording paths on mobile (it already exists in `sync-db.ts` and
   needs no new dependency), and that the web targets run in a secure context so
   `crypto.randomUUID()` exists. If either fails, use the ms+random form on both
   sides — the columns are `text` precisely so the format is not a schema
   concern.
6. **Playback of both containers** in the target clients: WebM/Opus from Chrome
   and MP4/AAC from iOS Safari, played through a Flask `Range` proxy.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Voice data is personal; a leak is serious | Private bucket, no client credential, owner-scoped streaming, no sharing, delete control, deletion on account delete, privacy copy updated with the release |
| Free-plan quota (1 GB) fills | One live take per slot (constraint), 2 MiB per file, 200 MiB per user, orphan sweep |
| Sync duplicates or loses a submit | Append-only attempts + primary key on `attemptId` + `user_sync_ops` idempotency; a replayed op is a no-op |
| A stale device overwrites newer answers | Per-blank LWW by `updatedAt`, and the append-only attempt log preserves what was actually submitted |
| Server state breaks the web server render | Adoption only after `pastHydration`; the HTML stays unanswered exactly as today |
| Content re-authoring orphans answers | `content_version` on every row, ignored on read, never deleted |
| Uploads become a DoS vector (big bodies, many requests) | Mime allow-list, magic-byte check, byte cap, per-user quota, rate limit, gzip-free streaming path |
| Account deletion leaves bytes / sync-log rows behind | Explicit prefix delete + `user_sync_log`/`user_sync_ops` cleanup for the user, tested in the manual matrix. `user_sync_log` has no FK cascade today — a pre-existing gap this work should close for the new entities at least |
| A new native dependency slips into a "docs only" release | Phase 3 is the only phase that needs a build; Phases 0–2 ship without one |
| Students believe local work is safe when it is not | Explicit "not saved yet" marker and retry, per § States |

## Open Questions

1. **Should a teacher ever hear a recording?** Out of scope now (Non-Goals), but it is the obvious next request and needs its own consent model.
2. **Keep every take, for Pro?** Deferred; the schema already allows it (voided rows keep metadata), so it is additive.
3. **Data residency beyond one region.** § Privacy makes the single region a stated limitation; whether to add an EU/China region or a per-student export is undecided.
4. **Per-user quota value.** 200 MiB is a placeholder sized against the pilot book; set it from the actual plan quota (Verification 2).
5. **Analytics reads.** Attempt rows make "which blanks are wrong" possible; who may query it, and does the admin console get a report? Not decided here.

## Dependencies

- **ADR-0053** (this spec's governing decision) — the storage and sync choice.
- **ADR-0040** — the web durable-queue pattern this copies, including its failure lessons.
- **SPEC-053** — the mobile outbox / `entity_cache` / `/sync/pull` engine the new entities plug into.
- **SPEC-039** — Supabase as the store, Flask as the only gateway.
- **SPEC-041** — account deletion, which must learn about the new tables and the bucket prefix.
- **SPEC-095** — the task/blank model and the content pipeline the `record` stimulus extends.
- **SPEC-066** — the append-only review-log shape the attempt table mirrors.
- **ADR-0046** — the China constraint that forces playback through Flask.
- **ADR-0043** — the contrast case: authored *content* media stays on the shared host; user *voice* does not.
- **ADR-0034** — Pro gating remains content access, never a data allowance.

## Resolved Decisions (2026-11-24)

| Question | Decision |
|---|---|
| Scope of sync | Responses + attempts + completion + recordings (all user-visible task data) |
| In-progress drafts across devices | Yes — per-blank LWW, not per-task |
| Completion storage | Derived from the latest un-voided attempt; no column |
| Attempt identity | Client-generated stable id (UUID on web, `makeSyncId()` on mobile); legacy `task#n` attempts are not backfilled |
| Audio backend | Private Supabase Storage bucket, Flask-only access |
| Audio format | Store as recorded (WebM/Opus, Ogg/Opus, MP4/AAC); no transcoding |
| Re-recording | Replaces: one live take per slot enforced by a partial unique index |
| Capture scope | Included, phased — server + sync first, web capture, then mobile capture |
| Docs | New ADR-0053 + this spec |
