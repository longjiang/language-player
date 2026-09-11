# ADR-0044 — Textbook exercise state is local-first, with an append-only attempt log in SRS's shape

**Status:** Accepted (2026-09-11)

## Context

SPEC-095 (interactive textbook) needs to persist three things:

1. **In-progress responses**, so a student who closes the app mid-unit resumes their answers.
2. **Completion state**, so the picker can show which tasks are done.
3. **Attempt outcomes**, so a student can see which blanks were right and wrong.

**None of this exists today, in any form.** A repo-wide search confirms there is no `questions`, `answers`, `attempts`, `exercises`, `quizzes` or `lessons` table, Directus collection, or type — and, more sharply, **no answer recording at all**: nothing anywhere persists the option a learner chose or the string they typed. The only stored artefact of a quiz-like interaction is a **derived FSRS rating**.

What does exist, and what the design must therefore relate to:

- **SRS progress is per-word, not per-exercise.** `SrsProgressStore` (`packages/shared/src/types.ts:781`) is `cards: Record<l2Code, Record<wordId, SrsFields>>`, scheduled by FSRS-6 (`packages/utils/src/fsrs-scheduler.ts`). It is served by `GET /srs` and `PUT /srs/cards` (`zerotohero-python-server/routes/user_data_columns.py:174,194`), last-write-wins on `updated_at`, with a free-tier cap returning `403 {"code":"srs_cap_reached"}` (`FREE_SRS_DAILY_CAP = 20`, `utils_user_data.py:382`; ADR-0034). Sync is hardened by an outbox (ADR-0040) and the sync entity registry (`packages/utils/src/sync-entities.ts:46–50`).
- **The only "answer" table in the system** is `public.user_srs_review_log` (`user_id, rating_id, l2, word_id, rating, review_at, voided_at`), created lazily at runtime (`utils_user_data.py:389`). It records one row per rating and supports **undo by voiding** (`voidRatingId`, which releases daily budget) and **idempotency by `rating_id`**. That shape is directly relevant here even though its subject (a word rating) is not.
- **Reading progress is device-local only.** Web persists position in `localStorage` (`apps/web/src/lib/reader-position.ts`), mobile in AsyncStorage (`apps/mobile/lib/reader-storage.ts`); `zerotohero-python-server/utils_sync.py:359` states explicitly that EPUB shelves and reading progress are local-only, and SPEC-065 remains draft. So "content progress" already has an established, accepted answer in this codebase: local.
- **Reuse of the SRS store for textbook responses is not viable.** It is keyed by word and scheduled by FSRS; a textbook blank is a position in an authored task with a known correct answer. Writing textbook responses into it would corrupt the review deck and conflate two different things.

Two constraints shape the alternatives:

- **`supabase/` is not the schema source of truth for user data.** The repo's `supabase/migrations/` (4 files, 445 lines) contains only RLS / identity-shadow / default-privilege migrations and never `CREATE TABLE`s the SRS tables: `user_srs_cards` came from the SPEC-039 data migration (`tmp/supabase-user-data-migrate.py`), and `user_srs_review_log` is created idempotently at runtime. Adding server-side exercise tables therefore is not a matter of appending a migration — it requires deciding where user-data DDL lives.
- **`user_srs_settings` was dropped** (ADR-0037); the daily new-card limit now lives only in `settings_v2.review.dailyNewLimit` (`packages/shared/src/types.ts:933,937`, default `20` at `:1063`). There is no server-side settings table or `PUT /srs/settings` endpoint to reuse for a textbook equivalent.

## Decision

**Persist textbook exercise state locally first, in an append-only log modelled on `user_srs_review_log`, and defer any server-side table and sync.**

1. **Responses are stored locally, keyed by canonical task and blank id** — `{ taskId, blankId }` — in a dedicated store separate from SRS. Web uses IndexedDB/localStorage; mobile uses AsyncStorage, matching the existing reading-progress precedent. Resume, completion, and result display all read from this store.
2. **Attempts are recorded as an append-only log with void semantics**, mirroring `user_srs_review_log`: each entry carries an id, the task and blank, the submitted response, whether it was correct, and a timestamp; re-answering appends a new entry and **voids** the prior one rather than mutating it. This makes "try again" lossless and keeps the door open for a future server sync and analytics without a schema rewrite.
3. **No new server table, endpoint, or sync entity in this spec.** Textbook responses do not join `SrsProgressStore`, the outbox, or the `/srs` routes. If server persistence is wanted later, it reuses the ADR-0040 outbox pattern and the same append-only + void + idempotency-key shape, and that is a separate decision.
4. **The store is versioned against content.** Each task carries a content version; responses are stamped with it, and a response whose version no longer matches is treated as stale and dropped. Re-authoring a task must therefore bump its version — otherwise a student's saved answer silently becomes wrong or unmatchable.
5. **Textbook progress does not feed SRS in this spec.** Incorrect blanks are not auto-added to the review deck. Routing wrong answers into SRS is attractive, but it needs its own decision about attribution (which word, which context) and about interaction with the free-tier daily cap.
6. **Pro gating, if applied, is content access — not a daily cap.** ADR-0034's cap exists to bound LLM cost per reviewed word; textbook tasks have pre-authored answers and cost nothing per attempt, so a cap would be a different mechanism for a different purpose and must not be borrowed by analogy.

## Consequences

- **Resume works offline and across restarts**, with no network dependency and no migration. This is a property of the **store**, not of the feature: a task still needs the network to tokenize its passage on web and to fetch its audio and images (SPEC-095, ADR-0043). Textbook offline support is a degradation — saved answers stay readable — not a supported mode.
- **No cross-device sync.** A student's textbook answers do not follow them between web and mobile. This is the same accepted gap that reading position already has, and it is the deliberate cost of not inventing a server schema mid-migration.
- **The data model is sync-ready.** Append-only entries with stable ids and void semantics are exactly what the SRS log already proves works for outbox-based sync, idempotency, and undo, so a future sync is additive rather than a redesign.
- **Content versioning becomes load-bearing.** Re-authoring a shipped task without bumping its content version will orphan or mis-grade saved responses; the authoring validator should flag a changed task whose version did not change.
- **Result analytics are not possible server-side** until a sync exists, so "which blanks do students get wrong" cannot be answered across users in this spec.
- **The free-tier/Pro boundary for textbook content is left open.** Only access gating is decided; nothing about a cap.
- **No answers are recoverable if local storage is cleared**, since there is no server copy. This is acceptable for practice content and consistent with reading position, but it must not be described to users as saved progress that follows their account.

## Alternatives Considered

- **Reuse `SrsProgressStore` / the SRS card model.** Rejected: it is keyed per word and FSRS-scheduled, so textbook blanks would pollute the review deck and the daily cap, and a task's positional answer has no place in a card's stability/difficulty state.
- **Add server tables and sync now.** Rejected as premature: it requires first deciding where user-data DDL lives (given `supabase/migrations/` does not own the SRS tables today), plus routes, a sync entity, and outbox integration — real infrastructure and migration risk in service of a feature whose progress is single-device practice state, and a gap the codebase already accepts for reading position.
- **Store responses in the SRS review log table.** Rejected: it is `word_id`-scoped and rating-shaped; bending it to hold task/blank answers would corrupt its meaning and break the existing admin analytics that read it.
- **Feed incorrect blanks into SRS immediately.** Rejected for this spec: it couples a new feature to the deck's scheduling and free-tier cap, and the attribution rule (which token, which lemma, which context) is a genuine open question, not an implementation detail.
