# SPEC-111: Task Data Sync and Student Recordings

## Metadata

- **Spec ID**: SPEC-111
- **Feature**: Server-side storage and cross-device sync for a student's textbook task data — responses, attempts, completion — and in-app capture of the student's own audio for speaking tasks, stored through the user file store
- **Status**: draft — **design only, nothing implemented**
- **Created**: 2026-11-24
- **ROADMAP Phase**: Phase 5 (Content Features)
- **Supersedes (in scope only)**: this spec replaces two statements in [SPEC-095](095-interactive-textbook.md) — the Non-Goal "Exercise state is local only" and the resolved decision "Attempt recording scope". The architectural decision behind the change is [ADR-0053](../adr/0053-task-data-sync-and-user-files.md) (revisions 1–3), which supersedes [ADR-0044](../adr/0044-textbook-exercise-state-local-only.md) decisions 2 and 3
- **Depends on**: [SPEC-113: User File Store](113-user-file-store.md) — where the recording bytes live, and what a `task_recording` kind means
- **Web ref**: `apps/web/src/components/textbook/task-provider.tsx`, `apps/web/src/app/[l1]/[l2]/tasks/…`, `apps/web/src/components/textbook/task-shell.tsx`
- **Mobile ref**: `apps/mobile/components/textbook/task-provider.tsx`, `apps/mobile/components/textbook/TaskView.tsx`, `apps/mobile/lib/sync-db.ts`, `apps/mobile/lib/sync-engine.ts`
- **Backend ref**: `zerotohero-python-server/routes/sync.py`, `utils_sync.py`, `routes/task_data.py` (new), `utils_task_data.py` (new), `routes/auth.py`
- **Shared ref**: `packages/textbooks/src/store.ts` (`TaskResponseStore`, `PersistedTaskState`), `packages/textbooks/src/types.ts`, `packages/utils/src/sync-entities.ts`
- **Related**: [SPEC-053](053-mobile-offline-mode.md) (sync engine), [SPEC-039](039-full-database-migration-supabase.md) (Supabase is the row store, Flask the gateway), [SPEC-066](066-srs-review-page.md) (the review-log shape the ID/idempotency lesson came from), [SPEC-041](041-delete-account.md) (account deletion), [ADR-0023](../adr/0023-proxy-supabase-auth-through-flask.md), [ADR-0040](../adr/0040-srs-sync-outbox-hardening.md), [ADR-0046](../adr/0046-china-blocked-third-party-hosts.md), [ADR-0034](../adr/0034-pro-gating-freemium-strategy.md)

## Overview

Today a student's task work exists only on the device that made it. Answers,
attempt outcomes and completion live in `localStorage` / `AsyncStorage` behind
`lp:textbook:` (ADR-0044), so a task started on the web cannot be finished on the
phone, a cleared browser loses everything, and no one can see which exercises students
get wrong.

This spec adds the server copy and the sync, and it adds the one thing the textbook
cannot do at all: **record the student's own voice**. D ➐ asks a student to read their
draft aloud; the app today has no microphone path, so the content tells them the
recording happens elsewhere.

The bytes are not this spec's subject. They live in the [user file store](113-user-file-store.md)
as the first registered kind (`task_recording`); this spec defines the kind, captures
the audio, and renders it. What this spec owns is the task-shaped state: per-blank
responses, one attempt per task, and completion derived from it.

Two properties shape the design:

1. **The device stays authoritative for the attempt in progress.** The local store
   already grades, resumes and completes a task with no network. Sync is a copy, never
   a precondition: a task must stay fully usable offline and signed out.
2. **Different state has different conflict rules.** A typed answer is
   last-write-wins *per blank*; an attempt is one row per task, last-write-wins on
   `submitted_at`; a recording is a file whose replace/append behaviour is the store's
   per-kind policy.

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
- **No sharing.** No teacher dashboard, no class roster, no public link to a student's recording, no staff playback of individual recordings. Aggregated, non-identifying analytics may read attempt rows; files are served to their owner only (SPEC-113).
- **No Pro gating of task data or recordings.** Pro gating stays content access (ADR-0044 D6).
- **No Classic (Nuxt) support.** `/tasks` does not exist in Classic (SPEC-095 scope note).
- **No per-device conflict UI.** Conflicts resolve by rule; a task has one attempt, so there is no retry history to reconcile.
- **No attempt history.** A task keeps one attempt; re-submitting replaces it. "Wrong first, right second" is not stored, and there is no per-attempt viewer.
- **No real-time collaboration or live push.** Sync happens on open/write/focus, not over websockets.
- **No file-store work in this spec.** Endpoints, keys, chunking, byte caps, playback tokens and deletion live in SPEC-113; this spec only registers a kind and consumes the API.
- **No offline cache of uploaded files on mobile** in this spec; playback streams.

## Current State (As-Built, Verified)

### What exists

| Concern | Today | File |
|---|---|---|
| Web persistence | `localStorage` under `lp:textbook:<taskId>` | `apps/web/src/components/textbook/task-provider.tsx:43,76-98` |
| Mobile persistence | `AsyncStorage`, same prefix, read before mount | `apps/mobile/components/textbook/task-provider.tsx:34,43-61` |
| State shape | `{ taskId, contentVersion, responses, attempts }` | `packages/textbooks/src/store.ts:46-52` |
| Attempts | an array today: `submit()` voids prior entries and appends one (revision 2 makes this one row) | `packages/textbooks/src/store.ts:185-241` |
| Completion | derived: the latest un-voided attempt's `result.complete` (becomes simply the attempt's) | `packages/textbooks/src/progress.ts` |
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
- **No user-file endpoints on the shared host.** The cache endpoints are cache-shaped (`bucket`/`key`, text payloads) and share one credential with the cache tier; they are not a user store. [SPEC-113](113-user-file-store.md) builds the store this feature needs.
- **No recording capability.** `expo-audio` / `expo-av` are not installed (mobile plays audio through `expo-video` to avoid a native rebuild — `apps/mobile/components/textbook/TaskAudio.tsx:19-27`), `MediaRecorder` appears nowhere in `apps/web`, and mobile's config explicitly **disables** the microphone permission (`apps/mobile/app.config.js:91-95`).

### Defects this spec has to fix on the way through

1. **Attempt ids are not unique across devices.** `` `${task.id}#${attemptSeq}` `` (`packages/textbooks/src/store.ts:195,228`) repeats on every device. Any server keyed on it collides the moment a student uses two devices.
2. **Task answers leak across accounts on a shared device.** Mobile's wipe deliberately keeps `lp:textbook:*` — *"it is device-local with no server copy, so wiping it would destroy the returning user's answers"* (`apps/mobile/lib/user-data-wipe.ts:3-11`) — and web's wipe list does not contain the prefix at all. So the next user to sign in on that device sees the previous user's drafts: the mobile task route loads them with `loadPersistedTask` (`apps/mobile/components/textbook/TaskView.tsx:50`), and `RecallCard` reads the same store on both platforms (`apps/web/src/components/textbook/recall-card.tsx:26`). Once the server holds the copy, the wipe becomes safe and must be added.
3. **Completion has no server representation**, because there is no server row — a derived property that must stay derived, not become a column.

## Goals and Acceptance Criteria

| # | Goal | Acceptance |
|---|---|---|
| G1 | Task responses sync per blank across devices | Answer b3 on web, open the same task on mobile, b3 shows the answer; two devices editing different blanks both keep their text |
| G2 | A task has exactly one attempt row | Submitting creates it; re-submitting replaces it; a replayed op cannot double-apply; no `attempt_id` and no `voided_at` exist |
| G3 | Completion is derivable server-side | No `completed` column; the attempt's `result.complete` reproduces `taskProgress()` exactly |
| G4 | A re-authored task does not silently grade stale answers | Responses whose `content_version` differs are ignored on read, on both the local and server path; a stale attempt is replaced on the next submit rather than shown |
| G5 | Offline work still works | Airplane mode: open, answer, submit, resume; the queue drains on reconnect with no user action and no lost answer |
| G6 | Signed-out use still works | A signed-out student gets the current local-only behaviour, with no failed requests and no prompt to sign in |
| G7 | A student can record, hear and replace themselves | Record up to 30 min mono at 16–24 kbps, play it back with seeking, replace it; exactly one live take per task slot exists server-side at any time (enforced by SPEC-113) |
| G8 | Recordings are private to their owner | An unauthenticated or other-user request for the bytes is refused; no host URL ever reaches a client (SPEC-113 G1/G2) |
| G9 | Deleting an account deletes its recordings | After account deletion, no object remains under that user's prefix and no `user_files` row survives (SPEC-113 G7) |
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
  /** The recorder's stop limit, in seconds. Defaults to `RECORDING_MAX_SEC`
   *  (1800) from `packages/textbooks`; a task may lower it (➐'s five short notes
   *  suggest about a minute). **Client-enforced only** — the server bounds storage
   *  by bytes, not by time (ADR-0053 rev. 3). */
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

One migration, `supabase/migrations/202611240001_user_task_data.sql`, following the
pattern `202610170001_affiliates_coupons.sql` established (real DDL in
`supabase/migrations/`, `user_id uuid references auth.users(id) on delete cascade`), and
extending the ownership arrays in
`202608200002_security_phase1_identity_shadow.sql` and
`202608200003_security_phase2_rls_policies.sql`. Recordings are not a table here: their
metadata is `public.user_files`, defined in [SPEC-113](113-user-file-store.md).

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

**One row per task, mutable** (ADR-0053 rev. 2). A submit replaces the row; there is
no append, no `attempt_id` and no `voided_at`. The table is a current-state row, not
a log — which is what the product actually reads, and what bounds storage by the
number of tasks instead of by how often a student retries.

```sql
create table public.user_task_attempts (
  user_id         uuid    not null references auth.users(id) on delete cascade,
  task_id         text    not null,
  content_version integer not null,
  responses       jsonb   not null default '{}'::jsonb,  -- snapshot at submit
  result          jsonb,                                 -- TaskResult, or null
  submitted_at    bigint  not null,                      -- attempt time; also the LWW key
  created_at      timestamptz not null default now(),
  primary key (user_id, task_id)
);
```

- **The task id is the key.** `(user_id, task_id)` means two devices cannot
  disagree about *which* row is the attempt — there is only one. The old
  `` `${task.id}#${seq}` `` id (`store.ts:195,228`) disappears rather than being
  made globally unique: with one row per task, an attempt id would be a second
  identifier for the same thing.
- **Replay safety comes from two places, neither of which is an attempt id.** The
  outbox op carries its own `idempotency_key` (recorded in `user_sync_ops`), and the
  upsert is last-write-wins: `on conflict (user_id, task_id) do update … where
  excluded.submitted_at >= user_task_attempts.submitted_at`. An older queued submit
  that arrives late loses and is reported as `dropped`, so it cannot overwrite a
  newer attempt.
- **The attempt is replaced, so the write order is the client clock's.** Two
  devices submitting within the same window resolve by `submitted_at`; a device whose
  clock is far ahead wins. That is the same trust the SRS card store already places
  in `state.lastReview`, accepted rather than solved here.
- **`recordChecked()` (self-check / read-only completion) updates the same row.**
  It is only offered when a task has nothing to grade — `needsExplicitCompletion`
  is `isSelfCheckOnly || isReadOnly` (`apps/web/src/components/textbook/task-shell.tsx:102`)
  — so replacing the result with the synthetic `{ complete: true, blanks: [] }` cannot
  discard a real grade. The validator gains a rule that a task mixing `selfCheck`
  with scoreable blanks is an error, so this stays true by construction.
- **`result` is a snapshot, not a reference.** Grading is client-side (`gradeTask`),
  so the server cannot recompute a past attempt under new content; storing the
  `TaskResult` is the only faithful record — and with a mutable row it is also the
  *only* record, so a result graded under an old content version is overwritten on
  the next submit instead of being retained.
- **Local state migrates on load.** `PersistedTaskState.attempts` (an array) becomes
  `attempt: AttemptRecord | null`. A shared `normalisePersistedTaskState()` in
  `packages/textbooks` collapses a legacy array to its latest entry and drops
  `voidedAt`, so both apps' storage adapters run one migration instead of two
  slightly different ones, and a student's existing answers survive the upgrade.

### RLS and grants

```sql
alter table public.user_task_responses enable row level security;
alter table public.user_task_attempts  enable row level security;
-- owner_select / owner_insert / owner_update / owner_delete, each
--   using ((select auth.uid()) = user_id)
grant select, insert, update, delete on
  public.user_task_responses, public.user_task_attempts
  to authenticated;
```

Defence in depth, not the access path: clients never speak PostgREST (ADR-0023,
SPEC-039 decision 5) and Flask connects as its own role. It matters because
`SUPABASE_REQUIRE_APP_DB_ROLE` can pin Flask to a restricted role
(`utils_db_context.py:70-82`), and because a future client-side mistake should fail
closed.

### Why two task tables, plus the store

| State | Write pattern | Conflict rule | Wrong if merged |
|---|---|---|---|
| Responses | every keystroke (debounced) | per-blank LWW | Per-task LWW would discard the other device's work on unrelated blanks |
| Attempts | once per submit, replaced on re-submit | one row per task, LWW on `submitted_at` | Appending would grow with retries and keep history nothing reads; a client-supplied id would be a second key for one row |
| Recordings | one file per slot | SPEC-113 kind policy: replace the slot | Storing bytes in the response row would re-upload audio on every keystroke path |

## Sync Design

### Entities

Two new entities in `packages/utils/src/sync-entities.ts` (client contract) and
`zerotohero-python-server/utils_sync.py` (`_HANDLERS`, `_ENTITY_SCHEMAS`):

| Entity | Payload | Coalesce | Ops |
|---|---|---|---|
| `task_response` | `{ taskId: string, blankId: string, contentVersion: number, value: string, updatedAt: number }` | replace the same `(taskId, blankId)` op | upsert |
| `task_attempt` | `{ taskId: string, contentVersion: number, responses: object, result: object\|null, submittedAt: number }` | replace — one row per task, so the last queued submit wins | upsert |

Entity id: `task_response` → `${taskId}#${blankId}`, `task_attempt` → `taskId`.
Server-side, both handlers write the row and the change log entry in one
transaction — `log_change()` already does this for every other entity.

**Server write guards** (mirroring the SRS row API, which the outbox was hardened
against):

- `task_response` upsert is last-write-wins in SQL, not in Python:
  `on conflict (user_id, task_id, blank_id) do update set … where excluded.updated_at >= user_task_responses.updated_at`,
  and a write older than a tombstone for the same entity is refused with
  `stale_after_delete()` (`utils_sync.py:161-164`) — the guard that stops a queued
  offline write resurrecting deleted state.
- `task_attempt` upsert is last-write-wins on the same key, in SQL:
  `on conflict (user_id, task_id) do update set content_version = …, responses = …, result = …, submitted_at = … where excluded.submitted_at >= user_task_attempts.submitted_at`.
  There is no void step and nothing to insert before: the row either exists or it
  does not. A replayed op is stopped earlier by `user_sync_ops`, and if it is not
  (a different op with the same payload), the LWW guard makes it harmless.
- A write that loses (older timestamp, stale after delete) returns
  `{ ok: true, dropped: true }`, the shape `_h_bookshelf` already uses, so the
  client can tell "already superseded" from "failed" and stop retrying.

### Files are not a push entity

An upload is a multipart request whose row insert is owned by that request
([SPEC-113](113-user-file-store.md) § Kind Rules). Letting `/sync/push` write the same
row would give it two writers, and a queued file payload would put binary data through
the change log. Instead the upload endpoint appends a **metadata-only** change to
`user_sync_log` under entity `user_file` (bytes never enter the log), so other devices
learn about the file through the pull they already run and fetch the bytes on demand.

`user_file` is therefore a **pull-only** entity: the client's merge path
(`mergeChange`, `sync-engine.ts:259-290`) is generic and needs no new code, and the push
path never sees it.

### Conflict rules

| Situation | Resolution |
|---|---|
| Two devices edit the same blank | Higher `updatedAt` wins (client clocks; the same basis the SRS store uses) |
| Two devices edit different blanks | Both kept — per-blank rows |
| Same attempt pushed twice (retry, replay, offline flush) | `user_sync_ops` returns the stored response; the LWW guard on `submitted_at` makes a duplicate harmless even if it slips through |
| Re-submit after a submit | The row is replaced: `responses`, `result`, `submitted_at`. The previous submission is not kept |
| An older queued submit arrives after a newer one | Loses the LWW guard and is reported `dropped`; it never overwrites the newer attempt |
| Task re-authored (new `contentVersion`) | Rows are **ignored on read**, never deleted, so a revert to old content restores them |
| Two devices upload a file for the same slot | `live_key` unique index picks one; the loser receives `409` and keeps its local file, showing "a newer recording from another device is here" |
| Local answer newer than the server's | The local store already wins on the same device; the queued op still drains and pushes the newer value |
| Attribution (who is `user_id`) | Supabase JWT `sub` via `utils_auth.authenticated_user_id()`, as every other user-data route |

### What syncs, and what must not

| State | Syncs? | Notes |
|---|---|---|
| `responses` | yes | per blank |
| `attempt` | yes | one row per task, replaced on submit |
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

## Student Recordings

Recording is the first consumer of [SPEC-113](113-user-file-store.md). Everything about
where the bytes go — the tree, the key, the endpoints, the byte cap, chunking, playback
tokens, deletion — is that spec's. This section defines only what the task feature must
supply.

### The `task_recording` kind

```python
# in zerotohero-python-server/utils_user_files.py, registered by this feature
'task_recording': FileKind(
    owner_types=('task',),
    mimes=('audio/webm', 'audio/ogg', 'audio/mp4', 'audio/m4a'),
    magic=('webm', 'ogg', 'mp4'),          # verified against the bytes, not the filename
    max_bytes=32 * 1024 * 1024,            # 30 min at up to ~149 kbps
    replaces_slot=True,                    # -> live_key, one live take per slot
    disposition='inline',                  # safe to play in place
),
```

- **No duration field.** The store bounds bytes; the 30-minute limit is the recorder's
  (`maxDurationSec`, § Content Model) and `duration_ms` is display-only metadata.
- **`replaces_slot=True`** is what makes "re-record replaces" a database constraint
  (`live_key = task_recording:task:<task_id>:<slot>`), not a convention.
- **The slot** is the task id plus the stimulus's `slotId` (`'task'` by default), so two
  `record` stimuli in one task need distinct slots — a validator rule.

### Capture (clients)

| Client | API | Container / MIME | Settings |
|---|---|---|---|
| Web, Chromium & Android | `MediaRecorder` over `getUserMedia({ audio: { channelCount: 1 } })` | WebM/Opus (`audio/webm;codecs=opus`), or Ogg/Opus (Firefox) | `audioBitsPerSecond: 24_000`; pick the first `MediaRecorder.isTypeSupported()` match, never assume |
| Web, Safari & iOS Safari | same | MP4/AAC (`audio/mp4`) | Safari cannot produce WebM; MediaRecorder is available from iOS 14.5 |
| Mobile, iOS & Android | `expo-audio` `useAudioRecorder` | M4A/AAC (`.m4a`) | `RecordingPresets`-derived with `numberOfChannels: 1`, `bitRate: 24_000`, `directory: 'document'` so an unsynced take cannot be evicted |

- **Bitrate is requested, not guaranteed.** 16–24 kbps mono Opus is transparent
  enough for speech and keeps 30 minutes at 3.4–5.2 MiB. If a platform ignores the
  hint, the byte cap (32 MiB) still covers 30 minutes at up to ~149 kbps.
- **The 30-minute limit is the recorder's**, from `maxDurationSec` (default
  `RECORDING_MAX_SEC = 1800` in `packages/textbooks`); the UI shows elapsed time,
  warns near the cap and stops at it. The server never checks duration.
- **Long takes need background recording on mobile.** Without it, locking the screen
  or switching apps suspends the audio session and the take ends. `expo-audio`'s
  `enableBackgroundRecording` adds iOS `UIBackgroundMode: audio` and an Android
  foreground service with a persistent notification — a battery and store-review
  cost that must be paid deliberately, because a 30-minute take is exactly the case
  where the student will leave the app.
- **Web records in timeslices** (`recorder.start(4_000)`): each `dataavailable` is
  uploaded as a chunk ([SPEC-113](113-user-file-store.md) § Long takes), so a closed tab
  costs at most the last few seconds instead of half an hour.
- **Permission is requested at first record**, never at launch; denial is a stated
  state with a path to OS settings, never a silent dead button.
- **Interruptions** (a phone call, an audio-session reset) end the recording; what was
  captured is offered for keeping rather than discarded.

### What the client uses from the store

- `uploadChunk` / `getReceivedChunks` / `completeUpload` for a take, or `uploadFile` for a
  short one — the same client SPEC-113 defines for every kind.
- `getFileUrl` before playback, because an `<audio>` element cannot send an
  `Authorization` header.
- `deleteFile` behind the student's delete control.

## API

All endpoints authenticate with the user's Supabase bearer JWT through
`utils_auth.authenticated_user_id()` and return `401` without one. New blueprint
`task_data_bp` (`routes/task_data.py`); helpers in `utils_task_data.py`. File endpoints
(`POST/GET/DELETE /files…`) are specified in [SPEC-113](113-user-file-store.md) § API and
are not repeated here.

| Method | Path | Purpose | Notes |
|---|---|---|---|
| GET | `/tasks/state?taskIds=a&taskIds=b` | Read responses, attempts and recording metadata for ≤ 20 tasks | Server is content-agnostic: it returns `content_version` per row and the client filters; file metadata is read from `user_files` |
| POST | `/sync/push` | Enqueue-drain for `task_response` / `task_attempt` | Existing endpoint; new handlers |
| GET | `/sync/pull?cursor=` | Cross-device changes, including `user_file` tombstones | Existing endpoint |

**Why a read endpoint and not pull-only?** `GET /sync/pull` replays the user's whole
change history since a cursor — correct for rebuilding a local cache, wrong for opening
one task: a student who has used the app for a month would replay thousands of ops to
paint one page. `/tasks/state` answers "what are the current rows for these two tasks",
which is the only question the task page asks.

`GET /tasks/state` response shape:

```jsonc
{
  "responses": [
    { "taskId": "…", "blankId": "b3", "contentVersion": 3, "value": "地铁", "updatedAt": 1764000000000 }
  ],
  "attempts": [
    { "taskId": "…", "contentVersion": 3,
      "responses": { "b1": "…" }, "result": { "complete": true, "correctCount": 4,
      "scoreableCount": 5, "blanks": [] }, "submittedAt": 1764000000000 }
  ],
  "files": [
    { "fileId": "…", "kind": "task_recording", "ownerType": "task", "ownerId": "…",
      "slot": "task", "mime": "audio/webm", "byteSize": 351232, "durationMs": 87000,
      "createdAt": 1764000000000 }
  ]
}
```

## Data Flow

1. Student opens a task. Web: server-rendered HTML (unanswered). Mobile: route
   resolves the book and the local copy first.
2. The device store loads its own state and renders. Nothing waits on the network.
3. `GET /tasks/state` fetches this task — and the tasks it recalls or carries from —
   and the result is merged after hydration (web) / after the route's async load
   (mobile), local-newest winning per row.
4. Student answers. Each blank writes to the store, which persists locally and
   enqueues one coalesced `task_response` op per `(task, blank)`.
5. Submit grades locally (`gradeTask`), writes the task's single attempt (replacing
   the previous submission), and enqueues a `task_attempt` op keyed by the task id.
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
- `store.ts` — `PersistedTaskState.attempt` (singular) replaces `attempts[]`;
  `AttemptRecord` loses `id` and `voidedAt`; `submit()` and `recordChecked()` write
  the one attempt; a merge entry point (`adoptServerState`) that applies remote rows
  under the same content-version rule.
- `persisted-state.ts` (new) — `normalisePersistedTaskState()`, the one-time collapse
  of a legacy `attempts[]` array to the latest entry, used by both apps' adapters.
- `recordings.ts` (new) — `recordingSlotsIn(task)`, `formatDuration(ms)`,
  `RECORDING_MAX_SEC = 1800`, `RECORDING_BYTES_CAP = 32 MiB`, `chunkCount(bytes)`.
  Pure functions only (AGENTS.md rule 1).
- `schema.ts` — validator rules: unique `slotId` per task, `record` only on
  speaking-ish task types, `maxDurationSec` bounds.

### Shared (`packages/utils`)

- `sync-entities.ts` — `task_response`, `task_attempt` definitions.

### Web (`apps/web`)

- `src/lib/task-sync-queue.ts` (new) — durable queue, modelled on `srs-pending-queue.ts` (ADR-0040).
- `src/lib/task-sync-client.ts` (new) — `fetchTaskState`, `pushOps`.
- `src/components/textbook/task-provider.tsx` — async server adoption after `pastHydration`; keep the existing synchronous store contract.
- `src/components/textbook/record-field.tsx` (new) — `MediaRecorder` control: record/stop/preview/replace/delete, elapsed timer against `maxDurationSec` (default 30 min), timeslice-driven chunk upload while recording, permission states. Uploads go through SPEC-113's client.
- `src/components/textbook/task-shell.tsx` — render `record` stimuli.
- `src/lib/user-data-wipe.ts` — wipe `lp:textbook:` and the task-sync queue.

### Mobile (`apps/mobile`)

- `lib/task-sync.ts` (new) — outbox writes for the two text entities, using `sync-db.ts`'s existing single-transaction writer.
- `components/textbook/RecordField.tsx` (new) — `expo-audio` recorder (mono, 24 kbps, background recording so a 30-minute take survives a screen lock) + expo-video playback of the stored take; uploads go through SPEC-113's client.
- `components/textbook/task-provider.tsx` — server adoption in the existing async load; wipe `lp:textbook:` in `lib/user-data-wipe.ts`.
- `app.config.js` — `expo-audio` plugin with a microphone usage string; replace the comment that currently explains why the permission is off.

### Backend (`zerotohero-python-server`)

- `routes/task_data.py` (new) — task-state endpoint.
- `utils_task_data.py` (new) — row CRUD for the two task tables.
- `utils_sync.py` — `_h_task_response`, `_h_task_attempt`, schemas, handlers.
- `utils_user_files.py` — one new entry in `FILE_KINDS` (above); no other change (SPEC-113 owns the module).
- `routes/auth.py` — the two tables in the e2e cleanup list; recording cleanup is SPEC-113's `delete_all_for_user()`.
- `supabase/migrations/202611240001_user_task_data.sql`.

### i18n

New keys, added through `scripts/add-translation-key.mjs` + `sync-translations.mjs`
(all 18 locales; never edit locale JSONs directly):

`task.record`, `task.recording`, `task.stop_recording`, `task.rerecord`,
`task.play_my_recording`, `task.delete_recording`, `task.recording_saved`,
`task.recording_upload_pending`, `task.recording_too_long`,
`task.recording_permission_denied`, `task.recording_mic_unavailable`,
`task.recording_uploading`, `task.recording_upload_resume`,
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
- **Too long**: recording stops at `maxDurationSec` (30 min by default) with a notice;
  the take so far is uploaded and offered for keeping.
- **Uploading a long take**: chunked upload shows progress and can be paused/resumed;
  a dropped connection or a closed tab loses at most the last part, and reopening the
  task offers **Resume** using the indices the host already has.
- **Replaced from another device**: shows the newer take with a one-line notice; the
  local file is discarded only after the student sees the notice.
- **Deleted account / signed out**: local task state is wiped (the leak in § Defects),
  and nothing is left to restore.
- **Task re-authored**: rows for the old version are not shown; a content revert
  brings responses back. The attempt is the exception: it is a single mutable row, so
  a result graded under the old version is replaced on the next submit rather than
  restored.
- **Attempt replaced from another device**: the newer `submitted_at` wins and the
  result banner re-renders; the student sees there is a newer attempt rather than a
  silently different score.
- **Store unavailable** (shared host down or slow): uploads and playback fail with
  `502 file_store_unavailable`, text sync is unaffected, and nothing is lost — the
  local file is kept and retried.

## Phasing

**Phase 0 — task data sync (no audio).** `…0001_user_task_data.sql` (tables, indexes,
RLS, grants); `task_response` / `task_attempt` entities; `GET /tasks/state`; the local
store's `attempts[]` → `attempt` change with `normalisePersistedTaskState()`; web queue;
mobile outbox; logout wipe fix; account-deletion table list. Ships cross-device answers
and results.

**Phase 1 — the user file store.** Delivered by [SPEC-113](113-user-file-store.md):
PHP endpoints and key, `user_files`, the policy registry, chunked upload, playback with
`Range`, deletion. This spec contributes the `task_recording` entry and nothing else.

**Phase 2 — web capture + D ➐ content.** `MediaRecorder` component, `record` stimulus,
validator rules, i18n keys, D ➐'s authored note corrected, translations regenerated. First
release where a student can complete the speaking task inside the product.

**Phase 3 — mobile capture.** `expo-audio`, microphone permission, new development
build, recorder component, wipe parity. Requires a device build; not a web-only release.

**Phase 4 — follow-ups (separate decisions).** Attempt analytics dashboards, optional
"keep every take" for Pro, transcription/pronunciation scoring, per-user export.

## Testing

- **Unit (shared)**: `normalisePersistedTaskState()` collapses a legacy array to its
  latest entry and drops `voidedAt`; `submit()` twice leaves exactly one attempt;
  server-state adoption respects content version and keeps the newer local value;
  `recordingSlotsIn` finds slots at every level; validator rejects duplicate `slotId`
  and a `selfCheck` blank mixed with scoreable ones.
- **Backend — text**: handlers are idempotent (same op twice → one row, same response); a
  re-submit replaces the row (still one row); an older `submitted_at` arriving late is
  `dropped` and does not overwrite; `GET /tasks/state` caps `taskIds`; RLS denies an
  `anon` read (run once with the anon key).
- **Kind registration**: the `task_recording` entry validates under SPEC-113's registry
  rules; an unknown kind is still rejected; a second upload for a live task slot → `409`.
- **Web components** (existing pattern: `task-audio.test.tsx`,
  `task-provider.test.tsx`): a saved server answer is adopted after hydration and never
  during the server render; a queued op survives a reload; offline submit queues and
  drains; recorder permission-denied state renders.
- **Mobile**: outbox row shape validated before enqueue (the ADR-0040 defect 1 class),
  pull applies `task_*` and `user_file` without new code, wipe removes `lp:textbook:`.
- **Manual matrix** (must be run, not assumed): desktop Chrome + Safari; iPhone Safari;
  Android Chrome; the mobile app on a device. Cross-device: answer on A, see it on B;
  submit on A, see the result on B; record on A, play on B; replace on B, see the notice
  on A; delete the account, confirm rows **and** objects are gone.
- **Store-level behaviour** (chunking, ranges, keys, sweeps) is tested in
  [SPEC-113](113-user-file-store.md) § Testing; this spec does not duplicate it.

## Verification Before Implementation

The host-side questions are settled and recorded in
[SPEC-113 § Verification](113-user-file-store.md); these are the ones this spec still
owes:

1. **Real take sizes per platform.** The bitrate is a request, not a contract. Record 30 s
   on iOS Safari, Chrome and the mobile app, and compare bytes/second with 16–24 kbps. If
   a platform overshoots badly, lower `maxDurationSec` for that kind or raise the cap —
   **never** add duration parsing.
2. **Background recording actually holds a 30-minute take** on a real device: lock the
   screen at minute 2, unlock at minute 20, and confirm the file is continuous. This is
   the behaviour most likely to differ from the docs.
3. **Adoption after hydration** on a task that already has a server attempt: the HTML must
   paint unanswered, then adopt on the next render — the failure mode ADR-0044 documents.
4. **`user_sync_log` survives account deletion.** `user_sync_log` has no FK cascade today;
   deletion must explicitly remove the user's log and ops rows, or "delete account" leaves
   task metadata behind.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Voice data is personal | Owner-only access through SPEC-113; delete control; deletion on account close; privacy copy covers audio and the ~2-week host backup tail |
| A 30-minute take is lost to a dropped connection or a closed tab | 4 MiB chunked upload with resume (SPEC-113), plus timeslice upload while recording on web |
| Background recording drains the battery or trips store review | Deliberate, documented cost of 30-minute takes; the alternative is takes that die on screen lock |
| Sync duplicates or loses a submit | `user_sync_ops` idempotency + the LWW guard on `submitted_at` |
| A stale device overwrites newer answers | Per-blank LWW by `updatedAt`; the single attempt is LWW on `submitted_at` |
| Server state breaks the web server render | Adoption only after `pastHydration` |
| Content re-authoring orphans answers | `content_version` on every row; responses ignored on read; the attempt is replaced on next submit |
| Task answers leak across accounts on a shared device | Logout wipe gains `lp:textbook:` once the server copy exists (§ Defects) |
| `user_sync_log` rows outlive the account | Explicit cleanup in `routes/auth.py` (§ Verification 4) |
| A new native dependency slips into a "docs only" release | Phase 3 is the only phase that needs a build; Phases 0–2 ship without one |
| Students believe local work is safe when it is not | Explicit "not saved yet" marker and retry |

## Open Questions

1. **Should a teacher ever hear a recording?** Out of scope now (Non-Goals), but it is the obvious next request and needs its own consent model.
2. **Keep every take, for Pro?** Deferred; it is a store-level retention choice (SPEC-113) plus a UI, so it is additive rather than a rewrite.
3. **Analytics reads.** Attempt rows make "which blanks are wrong" possible; who may query it, and does the admin console get a report? Not decided here.
4. **Should a speaking task count as complete without a recording?** Today completion is graded, and a recording is never scored; whether a missing take should block "complete" is a content decision.

## Dependencies

- **ADR-0053 (rev. 1–3)** — this spec's governing decision: task state via Flask, user files in a private store on the shared host.
- **SPEC-113** — the user file store the recordings use: tree, key, endpoints, kind policy, chunking, playback, deletion.
- **ADR-0040** — the web durable-queue pattern this copies, including its failure lessons.
- **SPEC-053** — the mobile outbox / `entity_cache` / `/sync/pull` engine the new entities plug into.
- **SPEC-039** — Supabase as the store, Flask as the only gateway.
- **SPEC-041** — account deletion, which must learn about the two tables and the store prefix.
- **SPEC-095** — the task/blank model and the content pipeline the `record` stimulus extends.
- **SPEC-066** — the review log ADR-0044 originally borrowed from; only its idempotency lesson survives (ADR-0053 rev. 2).
- **ADR-0046** — the China constraint that keeps every byte on a Flask-proxied path.
- **ADR-0034** — Pro gating remains content access, never a data allowance.

## Resolved Decisions (2026-11-24, revised 2026-11-25)

| Question | Decision |
|---|---|
| Scope of sync | Responses + attempts + completion, and recordings through SPEC-113 |
| In-progress drafts across devices | Yes — per-blank LWW, not per-task |
| Completion storage | Derived from the task's one attempt; no column |
| Attempt identity | **One mutable row per task**, keyed `(user_id, task_id)`; no attempt id, no void column; LWW on `submitted_at`; local `attempts[]` collapses to one on load |
| Recording bytes | SPEC-113's store; this spec registers the `task_recording` kind |
| Recording limits | 30 min (recorder), 16–24 kbps mono; the store bounds 32 MiB |
| Capture scope | Included, phased — sync first, web capture, then mobile capture |
| Docs | ADR-0053 (rev. 1–3) + this spec + SPEC-113 |
