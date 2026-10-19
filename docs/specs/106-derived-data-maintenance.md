# SPEC-106: Derived Content Data Maintenance — One Pipeline, Cheapest Guarantee

## Metadata

- **Spec ID**: SPEC-106
- **Feature**: Keep every derived artifact of `youtube_videos` correct when a
  video is added, updated or deleted (individually or in bulk): full-text and
  n-gram indexes, metadata embeddings, the lemmatization cache and the
  subs-search cache
- **Status**: draft
- **Created**: 2026-10-19
- **ROADMAP Phase**: Phase 9: Backend Consolidation
- **See also**:
  - [SPEC-096 — Admin Video Ingestion](096-admin-video-ingestion.md) — the write path this spec completes
  - [SPEC-099 — Admin Content Management](099-admin-content-management.md) — the edit/delete surface
  - [SPEC-044 — Subs-Search DB Optimizations](044-subs-search-db-optimizations.md) and [SPEC-045 / ADR-0026](<../adr/0026-continua-subs-search-indexing.md>) — the n-gram token index
  - [ARCH-036 — Subs-Search Architecture](../arch/036-subs-search-architecture.md)
  - [ARCH-037 — Video Content Schema & Index Inventory](../arch/037-video-content-schema.md)
  - [ADR-0021 — Migrate Video Content to Supabase](0021-migrate-video-content-to-supabase.md) — the metadata embeddings
  - [ARCH-034 — Video Lemmatization Cache](../arch/034-video-lemmatization-cache.md)
  - [ARCH-032 — YouTube Video Difficulty](../arch/032-youtube-video-difficulty.md) — the incremental scoring rule
  - [SPEC-105 — Video Content Index Cleanup](105-video-content-index-cleanup.md) — the read-side counterpart

## Overview

`youtube_videos` is the source of truth. Everything else is derived:

- **Postgres indexes** — full-text (word languages), n-gram tokens (continua),
  trigram (wildcard fallback);
- **metadata embeddings** — `video_embeddings` (pgvector, one row per video);
- **the lemmatization cache** — `lemmatized_subs` / `lemmatization`, keyed by
  `(language, video_id)`;
- **the subs-search result cache** — keyed by query, with no invalidation.

Today each artifact is maintained by a different ad-hoc rule: the full-text
indexes are maintained by Postgres (correct), the n-gram column is nulled by a
trigger and repaired by a manual/“nightly” script, the embeddings were a
one-time 2026-08-02/03 backfill, the lemma cache is never invalidated, and the
subs-search cache has no TTL. As a result, a newly imported video is missing
its n-gram entry and its embedding; editing any field re-writes `subs_l2` and
de-indexes a continua video; deleting a video leaves it in cached search
results; and editing metadata leaves a stale recommendation vector.

This spec proposes **one pipeline with a single rule**: each artifact is
maintained by the cheapest mechanism that can *guarantee* correctness.

> **The rule.** If Postgres can maintain it, let Postgres. If it is cheap
> local CPU, compute it synchronously in the write path. If it needs an
> external API or expensive CPU, put it in a transactional outbox drained by a
> worker. If it is a cache, version it and delete it when its source row is
> deleted — never try to find cache entries by their contents.

## Artifact → mechanism

| Artifact | Mechanism | Latency | Guarantee |
|---|---|---|---|
| Full-text GIN (`subs_tsv_idx`) | Postgres expression-index maintenance | immediate | automatic on every write |
| Trigram GIN (`subs_l2_trgm_idx`) | Postgres index maintenance | immediate | automatic (see SPEC-105 for its future) |
| `subs_ngram_tsv` | **synchronous** token computation in `create_video` / `update_video` | immediate | trigger remains the safety net for non-app writers |
| `video_embeddings` | **transactional outbox** + cron worker | minutes | trigger enqueues; worker retries; FK cascade on delete |
| `lemmatized_subs` | delete the per-video entry on subtitle change/delete; recompute on write | immediate | content-keyed cache miss after invalidation |
| `subs_search` results | **content revision + TTL**; revision bumped on any video write | immediate | stale entries are ignored, not searched for |
| Static counts (`LANGUAGE_VIDEO_COUNT`) | regenerated from the DB (not per-write) | next refresh | see SPEC-105 |

## Current gaps (measured 2026-10-19)

- **N-gram**: 405 continua rows have `subs_ngram_tsv IS NULL`; 291 have no
  `subs_l2` at all (nothing to index). Of the 114 with subtitles, **36 contain
  substantial text** (33 `zh`, 2 `nan`, 1 `th`), including the 8 newest `zh`
  rows. The trigger nulls the column on every `INSERT`/`UPDATE OF subs_l2`,
  and the only repair path is the manual `backfill_subs_ngram_tsv.py`.
- **Embeddings**: 1,045,293 rows vs 1,045,301 videos after the dedupe — the 8
  newest `zh` videos have no embedding. Every row was last written
  2026-08-02/03; nothing re-embeds on insert or update. Metadata edits leave
  the old vector in the HNSW index indefinitely.
- **Lemma cache**: deleting a video does not delete its entry. Because ids are
  allocated as `max(id)+1`, deleting the newest row makes the next import
  reuse that id and inherit the deleted video's tokenization.
- **Subs-search cache**: no TTL, no invalidation. A renamed or deleted video
  is still returned from a previously cached query.
- **Edits**: the admin dialog always re-sends the full `subs_l2` when the
  video has subtitles, so a title-only edit fires the n-gram invalidation
  trigger. Difficulty and the lemma cache are not recomputed when the
  subtitles actually change.

## Design

### 1. N-gram tokens: synchronous local computation

- Move `extract_tokens()` out of `backfill_subs_ngram_tsv.py` into a shared
  module (`utils_subs_ngram.py`), keeping the existing tests.
- `content.create_video()` and `content.update_video()` set
  `subs_ngram_tsv` whenever `subs_l2` is in the payload and the row's `l2` is
  a continua language. The import already has the CSV, so this is one string
  pass; no extra round trip.
- Fix the invalidation trigger so a caller-supplied tsvector survives:
  - `INSERT`: keep `new.subs_ngram_tsv` if it is not null.
  - `UPDATE`: set it to null only when `subs_l2` changed **and** the caller
    did not supply a new value.
  - This keeps the trigger as the safety net for raw SQL and future writers
    without wiping the value the app just computed.
- Keep `backfill_subs_ngram_tsv.py` as the repair tool and give the worker a
  sweep for `subs_l2 IS NOT NULL AND subs_ngram_tsv IS NULL`.

### 2. Embeddings: transactional outbox + worker

External API + cost + batching + failures = never inline.

```sql
create table public.derived_jobs (
  id           bigint generated by default as identity primary key,
  video_id     bigint not null references public.youtube_videos(id) on delete cascade,
  kind         text not null default 'embed',
  attempts     integer not null default 0,
  last_error   text,
  enqueued_at  timestamptz not null default now(),
  unique (video_id, kind)
);
create index derived_jobs_kind_enqueued_idx on public.derived_jobs (kind, enqueued_at);
```

Trigger on `youtube_videos`:

- `AFTER INSERT` → `insert into derived_jobs(video_id, kind) values (new.id, 'embed') on conflict do nothing`.
- `AFTER UPDATE OF title, tags, topic, category, channel_id, locale, level, type, l2`
  → **delete the existing embedding row** (absent, never stale) and enqueue
  `embed`.
- **Not** on `views`, `likes`, `comments`, `status`, `notes`, `date`,
  `duration`, `talk`, `tv_show`, `lesson` — none of these feed the embedding
  text, so routine import refreshes and bulk show assignment do not trigger
  re-embeds.
- `AFTER DELETE` → nothing; both the embedding and the job cascade.

Worker `scripts/maintain_derived_data.py` (tracked, `python3.10`):

1. Drain `derived_jobs` in batches (up to 100 inputs per `batchEmbedContents`
   call), upsert `video_embeddings` with
   `on conflict (video_id, model, kind) do update set embedding = excluded.embedding, l2 = excluded.l2, updated_at = now()`,
   delete the jobs.
2. On failure: increment `attempts`, store `last_error`, leave the job for the
   next run with backoff; after N attempts, stop retrying and report.
3. Reconcile once a day: videos with no embedding for the current
   `(model, kind)`, and continua rows with `subs_l2 IS NOT NULL AND
   subs_ngram_tsv IS NULL`. This is the self-healing backstop (and the
   one-time fix for the current 8 + 36 row backlog).
4. Log a summary with the existing backend tag convention.

Schedule: cron on the Flask VPS every 5 minutes, alongside `prune_cache.py`;
the interval is an open question (below). Also add
`video_embeddings.video_id → youtube_videos(id) ON DELETE CASCADE` so any
delete path, including raw SQL, cleans the vector.

### 3. Caches: version, don't search

- `content_revision(id smallint primary key default 1, rev bigint not null,
  updated_at timestamptz not null)` — one row.
- A statement-level `AFTER INSERT/UPDATE/DELETE ON youtube_videos` trigger
  bumps `rev`/`updated_at`. (Statement-level keeps a multi-row statement to
  one bump; the import's one-insert-per-video still bumps per video, which is
  negligible.)
- Subs-search entries become `{saved_at, videos}`. On read, a `pg`-namespace
  entry is a miss when `saved_at < content_revision.updated_at`; cache the
  revision in-process for ~5 s. Keep a generous TTL (e.g. 1 hour) as a
  backstop.
- Add `remote_cache.delete(bucket, key)` (local file + remote host; the
  existing `remote_delete()` only removes the remote copy). Call it for
  `lemmatized_subs` when a video is deleted or its `subs_l2` changes.
- Deleting the lemma cache on delete also fixes id reuse: a new import that
  gets the recycled id starts from an empty cache.

### 4. Updates: only do the work that changed

- **Admin dialog**: send `subs_l2` only when the textarea actually changed.
  This stops title-only edits from de-indexing continua videos.
- **Server**: when `subs_l2` really changes, (a) compute the n-gram tokens,
  (b) delete the lemma cache entry, (c) recompute `lex_div` / `word_freq` /
  `difficulty` from the new text. Start synchronous (a single edit is rare
  and the import path already does this work); if ja/zh latency is too high,
  move (c) to a `rescore` job in the same outbox.
- Document this as the explicit exception to ARCH-032's "never recompute an
  existing value" rule.
- L2 is already fixed after creation in the admin UI. Decide whether the API
  should reject an `l2` change; if it is allowed, the embedding's denormalized
  `l2` must be updated (the worker's upsert sets it, but the old vector would
  sit in the old language's partial HNSW index until re-embedded).

### 5. Bulk operations

- **Import** (single / batch / channel / playlist): n-gram computed inline
  (cheap); one outbox row per video, collapsed by `unique(video_id, kind)`;
  one revision bump per committed insert; the worker batches the embeddings.
- **Bulk delete**: FK cascades remove embeddings and jobs; lemma cache entries
  deleted per id; one revision bump; no queue work.
- **Bulk assign** (TV show / talk): no derived artifact depends on these
  fields; deliberately no jobs and no re-embeds.
- **Duplicate protection**: the `(youtube_id, l2)` unique index (SPEC-105)
  makes a race return `skipped/exists` (import) or `409` (admin create)
  instead of creating a second row.

### 6. Observability

- `GET /admin/content-health` (admin-gated): pending/failed `derived_jobs`,
  videos missing an embedding for the current model, continua rows with
  subtitles but NULL `subs_ngram_tsv`, current `content_revision`, last worker
  run, last error.
- A "Content health" panel in `apps/admin` showing the same, plus a bounded
  "run maintenance now" action (drain one batch) so a dead cron is visible and
  recoverable.
- Alert when the backlog exceeds a threshold or the worker has not run for
  N minutes.

## Phases

Each phase is independently shippable and reversible.

| Phase | Work | Result |
|---|---|---|
| 0 | Correct the docs listed below; run the one-time n-gram backfill (36 rows) and embed the 8 missing videos | current data correct |
| 1 | Shared tokenizer; n-gram on write; trigger fix; admin `subs_l2` dirty-check; tests | imports/edits indexed immediately |
| 2 | `content_revision`; cache envelope + TTL; lemma-cache delete; `video_embeddings` FK cascade; tests | deletes/edits stop leaking through caches |
| 3 | `derived_jobs` + trigger + tracked embedding module + worker + cron + reconciliation | new/updated videos embedded automatically |
| 4 | Content-health endpoint/panel; alerting | the invariant is observable |

## Verification

- **Unit**: `extract_tokens` parity with the backfill; n-gram set on insert and
  on `subs_l2` update; trigger preserves an explicit value and nulls an
  omitted one; outbox enqueued on insert and on each embedding-field update,
  not on `views`/`talk`; FK cascade on delete; cache revision invalidates an
  entry; lemma cache delete called on delete/edit; duplicate insert yields
  `skipped/exists` / `409`.
- **Integration** (staging DB): import a video → n-gram set immediately;
  metadata edit → embedding row gone + job queued; worker run → embedding
  present with the new `l2`/model; delete → no embedding, no job, no lemma
  cache, revision bumped; a cached search request after a delete does not
  return the deleted video.
- **Operational**: backlog metrics return to zero after a bulk import; worker
  runtime and Gemini error rate stay within budget.

## Files

| File | Role |
|---|---|
| `zerotohero-python-server/utils_subs_ngram.py` | shared token extraction (new) |
| `zerotohero-python-server/utils_content.py` | `create_video` / `update_video` / `delete_video`, cache revision |
| `zerotohero-python-server/utils_video_import.py` | duplicate race handling; inline tokens |
| `zerotohero-python-server/utils_video_lemma.py` | cache invalidation / force recompute |
| `zerotohero-python-server/utils_cache.py`, `remote_cache.py` | revision-aware reads; `delete()` |
| `zerotohero-python-server/scripts/maintain_derived_data.py` | outbox drain + reconciliation (new) |
| `zerotohero-python-server/scripts/backfill_subs_ngram_tsv.py` | repair tool, unchanged behavior |
| `zerotohero-python-server/routes/admin.py` | content-health endpoint; 409 on duplicate create |
| `apps/admin/src/components/content/video-dialog.tsx` | send `subs_l2` only when changed |
| `apps/admin/src/app/content/health/page.tsx` | content-health panel (new) |
| `supabase/migrations/…` | `derived_jobs`, triggers, revision, FK cascade |
| `docs/adr/…` | new ADR for the derived-data layer |

## Risks

- **Trigger cost.** The embedding trigger fires on every insert and on the
  listed metadata columns only; the revision trigger is a single-row update.
  Both are cheap relative to transcript downloads, but measure on a bulk
  import.
- **Embedding gaps during the worker lag.** New/edited videos are absent from
  recommendations until the worker runs. That is the intended “absent, never
  stale” trade-off; the interval is an open question.
- **Gemini quota/cost.** Batch 100 inputs per call, retry with backoff, and
  reconcile rather than re-embedding the catalog. The one-time 1M backfill
  cost ~CA$30; per-video re-embeds are negligible.
- **Two writers.** The triggers assume every writer goes through Postgres
  (true for the Flask DAL and raw SQL). If a future writer bypasses the DB,
  the reconciliation sweep is the backstop.
- **Doc drift.** SPEC-096 currently documents “the n-gram index is not
  refreshed”; ADR-0021 documents a one-time embedding backfill. Both must be
  amended with this spec, not after it.

## Documentation to update (contradictions to resolve first)

- **SPEC-096** — remove the “ngram subtitle index is not refreshed” Known
  Limitation and resolve its Open Question; document the outbox and the 409.
- **ADR-0021** — embeddings are maintained incrementally now; add the FK
  cascade and the “absent, never stale” rule.
- **SPEC-044 / ARCH-036** — replace “nightly backfill” with the inline path +
  the worker sweep; document the cache revision/TTL instead of “manual
  clearing only”.
- **SPEC-099** — document that only changed subtitles are sent, and that a
  subtitle edit re-indexes and re-scores.
- **ARCH-034** — its claim that a subtitle edit invalidates the whole-video
  entry is not what the code does; make it true or correct the doc.
- **New ADR** — “Derived content data maintenance (indexes, embeddings,
  caches)” so the invariant, not the individual scripts, is the design.

## Open Questions

1. **Worker cadence and ownership.** Is a 5-minute cron on the Flask VPS
   acceptable (the `prune_cache.py` pattern), or should the worker be a
   Supabase scheduled function / a separate always-on process? Who owns it?
2. **Acceptable latency.** How long may a new or edited video be absent from
   recommendations (and from subs-search, if the n-gram is ever made async)?
   Minutes, or must it be immediate?
3. **Rescoring on subtitle edits.** Recompute `lex_div` / `word_freq` /
   `difficulty` synchronously (correct, but seconds of CPU for ja/zh), enqueue
   a `rescore` job, or keep ARCH-032's incremental rule and accept stale
   scores after an edit?
4. **Outbox vs dirty flag.** Is a `derived_jobs` table worth the extra state,
   or is a `needs_embedding` boolean on `youtube_videos` (with a partial index)
   enough for this project?
5. **L2 changes.** Should the API reject an `l2` change after creation (the UI
   already fixes it), or support it and re-embed / re-index?
6. **Embedding model changes.** When `gemini-embedding-2@1024` is replaced,
   is the plan a versioned re-embed (the `model` column isolates versions), and
   how is the old model's partial HNSW index retired?
7. **Subtitle embeddings.** ADR-0021 calls them a later phase. If they happen,
   does `kind` become a second outbox artifact, and do they use the same
   worker?
8. **Cache TTL.** What TTL is acceptable for subs-search (1 hour? 15
   minutes?), and is the revision check worth the extra per-request read?
9. **Deploy-time backfill.** Should the worker automatically drain the current
   8 missing embeddings + 36 n-gram rows on first deploy, or should that stay a
   manual one-off?
10. **Quota/alerting thresholds.** What pending-job backlog or failure count
    should page someone, and through which channel?
11. **Job retention.** How long should failed `derived_jobs` rows and the
    `backup.*_20261019` tables be kept?
12. **Trigram dependency.** Resolved 2026-10-19: the `subs_l2` trigram index
    is **kept** for wildcard/space-term queries and future grammar examples
    (SPEC-105), so wildcard subs-search keeps its indexed path.
13. **Single writer assumption.** Is the Flask server the only writer to
    `youtube_videos` forever, or must the triggers fully cover direct SQL /
    future services?
