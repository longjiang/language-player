# SPEC-106: Derived Content Data Maintenance — One Pipeline, Cheapest Guarantee

## Metadata

- **Spec ID**: SPEC-106
- **Feature**: Keep every derived artifact of `youtube_videos` correct when a
  video is added, updated or deleted (individually or in bulk): full-text and
  n-gram indexes, metadata embeddings, the lemmatization cache and the
  subs-search cache
- **Status**: complete (2026-10-19)
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
> external API or expensive CPU, mark the row as dirty and let a scheduled
> worker drain the flag (with an admin "update now" escape hatch). If it is a
> cache, version it and delete it when its source row is deleted — never try to
> find cache entries by their contents.

## Artifact → mechanism

| Artifact | Mechanism | Latency | Guarantee |
|---|---|---|---|
| Full-text GIN (`subs_tsv_idx`) | Postgres expression-index maintenance | immediate | automatic on every write |
| Trigram GIN (`subs_l2_trgm_idx`) | Postgres index maintenance | immediate | automatic (retained — SPEC-105) |
| `subs_ngram_tsv` | **synchronous** token computation in `create_video` / `update_video` | immediate | trigger remains the safety net for non-app writers |
| `video_embeddings` | **`needs_embedding` dirty flag** + daily worker; admin "Update now" | ≤ 1 day, or immediate on demand | DB trigger flags every writer; FK cascade on delete |
| `lemmatized_subs` | delete the entry on subtitle/L2 change; bulk deletes use the batch cache-delete endpoint | immediate | content-keyed cache miss after invalidation |
| `subs_search` results | **content revision** (primary) + optional TTL (30-day backstop); admin cache-bust | immediate on write; no TTL expiry needed | stale entries are ignored, not searched for |
| Per-language counts | `language_video_counts` matview refreshed by the daily worker | daily | `GET /stats/language-video-counts`; static maps are fallbacks (SPEC-105) |

Subs-search itself does **not** wait for the worker: the n-gram tokens are
computed inline, and the full-text/trigram indexes are maintained by Postgres.
Only the metadata embedding is asynchronous.

## Decisions (2026-10-19)

| Question | Decision |
|---|---|
| Worker cadence | **Daily cron on the Flask VPS** (the `prune_cache.py` pattern), plus an admin **Update now** action for immediate work. `pg_cron` was evaluated and rejected: it runs SQL only, so it would need `pg_net` + a Vault secret + an HTTP hop back to Flask. The VPS cron adds no new network path or secret. |
| Latency | Embeddings: ≤ 1 day automatically, immediate on demand. Sub-search: immediate (inline n-gram); no daily wait. |
| Rescore on subtitle edit | **Synchronous** — never serve stale scores. Delete the lemma cache first; if recompute fails, set the scores to NULL so they are visibly missing rather than silently stale. |
| Queue shape | A **`needs_embedding` flag on `youtube_videos`** (plus attempts/error/requested_at) is enough. No separate `derived_jobs` table. |
| L2 changes | **Supported**: delete the embedding + flag, recompute n-gram/scores, delete the lemma cache; the worker re-embeds with the new `l2`. |
| Embedding model changes | No change now. Keep `model`/`kind` and a config-driven worker so a future versioned re-embed is a migration, not a redesign. |
| Cache TTL | **Revision check is the primary invalidation** (every write bumps it), so no 24 h TTL is needed. Keep a **30-day backstop**, configurable to `0` (indefinite), plus the admin cache-bust. The current code has **no TTL** at all. |
| Deploy backfill | Manual one-off; the worker does not auto-drain the initial 8 + 36 rows. |
| Alerting | Admin health panel + failed-row list; email/log thresholds (no pager). |
| Retention | **7 days** for failed state and the `backup.*_20261019` tables. |
| Trigram | **Kept** (SPEC-105); wildcard/space-term search keeps its index. |
| Writers | DB triggers cover direct SQL and future services; the app also does the inline work. |

## Implementation (2026-10-19)

- Migration `202610190004_video_derived_data.sql` applied: n-gram trigger fix,
  `needs_embedding` columns + partial index, flag/invalidate triggers,
  `video_embeddings` FK cascade, `content_revision` + bump trigger, and
  `maintenance_runs`.
- N-gram tokens are computed inline in `utils_content.create_video` /
  `update_video` via the shared `utils_subs_ngram.py`; the backfill script
  imports the same tokenizer.
- Subtitle/L2 edits delete the lemma cache and recompute scores synchronously.
  The admin dialog sends `subs_l2` only when it changed, so a title-only edit
  no longer fires the n-gram invalidation.
- Worker `scripts/maintain_derived_data.py` (`--limit`, `--report`,
  `--flag-missing`, `--reindex-ngram`) plus the admin routes
  `GET /admin/content-health`, `POST /admin/maintenance/run-embeddings`,
  `POST /admin/maintenance/reindex-ngram`, `POST /admin/cache/bust`; the admin
  Content health page and nav item are in `apps/admin`.
- Subs-search cache entries store `{saved_at, videos}` and compare against
  `content_revision` (5 s in-process cache) with a 30-day configurable
  backstop. `utils_cache.delete_from_lemmatized_subs_cache` and
  `remote_cache.delete()` handle per-video invalidation; bulk deletes use
  `remote_cache.delete_many()` → `delete-flask-cache-batch.php` (one request
  per 1,000 keys).
- The daily worker also refreshes `public.language_video_counts` (the
  landing-page counts) after the embedding drain.
- Data catch-up: the 8 missing embeddings were embedded and the 114
  n-gram-missing rows reindexed; 106 remain NULL because their subtitles have
  no tokenizable `line` text (by design). `--report` now shows 0 pending and
  0 missing embeddings.
- Tests: `test_derived_data.py` (8) plus the admin import/preflight/list
  suites (93) pass. The daily cron line is the only ops step:
  `15 3 * * * cd /srv/flask && python3.10 scripts/maintain_derived_data.py`.
- Follow-up (2026-10-19): channel deletes invalidated the lemma cache with one
  HTTPS request per video, so a 5,000-video channel took ~20 minutes. Bulk
  invalidation now goes through `remote_cache.delete_many()` and the shared
  host's `delete-flask-cache-batch.php` (one request per 1,000 keys), and the
  content delete commits before the cache cleanup runs. See § 5.
- **Deploy order**: `delete-flask-cache-batch.php` must be live on
  `server.chinesezerotohero.com` before the new Python path is deployed.
  Until it is, the batch call logs a `404` warning, the content delete still
  succeeds, and lemma-cache invalidation is skipped for that delete.

## Current gaps (measured 2026-10-19, before implementation)

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
- Keep `backfill_subs_ngram_tsv.py` as the repair tool; the worker only
  **reports** rows with `subs_l2 IS NOT NULL AND subs_ngram_tsv IS NULL`.

### 2. Embeddings: a dirty flag + a daily worker

External API + cost + batching + failures = never inline. The question is
whether the queue needs its own table. **It does not:** embeddings are the only
asynchronous artifact (n-gram is inline, rescore is synchronous), so a flag on
the row is enough and removes a table, a join and a second source of truth.

**Why a flag instead of `derived_jobs`.** The outbox's advantages are multiple
job kinds, ordering, and an audit trail of attempts. Here there is one kind;
the partial index orders by `embed_requested_at`; and the attempts/error
columns provide the audit. A flag collapses automatically (no duplicate jobs
to `ON CONFLICT`), dies with the row (no cascade cleanup), and is one boolean
to explain to the next reader. If subtitle embeddings (a second kind) or
per-model queues are added, a job table is the natural upgrade.

```sql
alter table public.youtube_videos
  add column if not exists needs_embedding boolean not null default false,
  add column if not exists embed_attempts integer not null default 0,
  add column if not exists embed_error text,
  add column if not exists embed_requested_at timestamptz;

create index concurrently if not exists youtube_videos_needs_embedding_idx
  on public.youtube_videos (embed_requested_at)
  where needs_embedding;
```

Trigger (the DB-level safety net for every writer, including raw SQL):

- `BEFORE INSERT OR UPDATE OF title, tags, topic, category, channel_id, locale,
  level, type, l2` → set `NEW.needs_embedding = true`,
  `NEW.embed_requested_at = now()`, `NEW.embed_attempts = 0`,
  `NEW.embed_error = null` (a `BEFORE` trigger, so no second row write).
- `AFTER UPDATE OF` the same columns → **delete the existing embedding row**
  (absent, never stale).
- **Not** on `views`, `likes`, `comments`, `status`, `notes`, `date`,
  `duration`, `talk`, `tv_show`, `lesson` — none feed the embedding text, so
  routine import refreshes and bulk show assignment do not re-embed.
- `AFTER DELETE` → nothing; the `video_embeddings` FK cascade removes the
  vector.

Worker `scripts/maintain_derived_data.py` (tracked, `python3.10`):

1. Select `where needs_embedding order by embed_requested_at limit 100` (the
   partial index) and call `batchEmbedContents` (up to 100 inputs per call).
2. Upsert `video_embeddings` with
   `on conflict (video_id, model, kind) do update set embedding = excluded.embedding, l2 = excluded.l2, updated_at = now()`.
3. On success: `needs_embedding = false`, clear attempts/error/requested_at.
4. On failure: `embed_attempts += 1`, store `embed_error`, leave the flag. The
   next run retries; after 5 attempts it is reported as failed and the admin
   decides (retry/reset), rather than retrying forever.
5. A **report-only** reconciliation: videos with no embedding for the current
   model and continua rows with subtitles but NULL `subs_ngram_tsv`. It lists
   them (health panel) but does not auto-flag them, so the initial 8 + 36
   backlog stays a deliberate one-off.

Schedule: the VPS crontab runs the worker **daily** (e.g. `15 3 * * *`) and
logs to `/var/log/langplayer-derived.log`; the admin **Update now** button
calls the same drain function for one bounded batch (≤ 50). The drain is
idempotent, so a manual run and the cron can overlap harmlessly.

**Why not Supabase `pg_cron`.** It was evaluated and rejected for this
project: `pg_cron` runs SQL only, so it cannot call Gemini; it would need
`pg_net` (another extension), a shared secret in Vault, and an HTTP hop back
to the same Flask endpoint. The VPS already runs `prune_cache.py` on cron, so
using it for this worker adds no new moving part.

Also add `video_embeddings.video_id → youtube_videos(id) ON DELETE CASCADE` so
any delete path cleans the vector.

### 3. Caches: version, don't search

- `content_revision(id smallint primary key default 1, rev bigint not null,
  updated_at timestamptz not null)` — one row.
- A statement-level `AFTER INSERT/UPDATE/DELETE ON youtube_videos` trigger
  bumps `rev`/`updated_at`. (Statement-level keeps a multi-row statement to
  one bump; the import's one-insert-per-video still bumps per video, which is
  negligible.)
- Subs-search entries become `{saved_at, videos}`. On read, a `pg`-namespace
  entry is a miss when `saved_at < content_revision.updated_at`. Read the
  revision once per request and cache it in-process for ~5 s. This is the
  primary invalidation: **every write bumps the revision, so a 24 h TTL is not
  needed for correctness**. Keep a long backstop anyway — default **30 days**,
  configurable to `0` (indefinite) — to cover a missed/broken trigger and
  entries written before the revision mechanism existed. On deploy, bump the
  revision once so every pre-existing entry is a miss. The current code has
  **no TTL** at all (manual deletion only). A TTL only makes reads miss; it
  does not delete files — if unbounded disk becomes a concern, add a prune
  step for `cache/subs_search`.
- Admin cache-bust: `POST /admin/cache/bust` bumps `content_revision` (every
  old entry immediately becomes a miss) and deletes the local
  `cache/subs_search` files; the Content health panel gets a **Clear search
  cache** button. This is the immediate escape hatch when a result looks
  stale.
- Add `remote_cache.delete(bucket, key)` (local file + remote host; the
  existing `remote_delete()` only removes the remote copy). Call it for
  `lemmatized_subs` when a video is deleted or its `subs_l2`/`l2` changes.
- Add `remote_cache.delete_many(bucket, keys)` for bulk invalidation. It
  removes local files and POSTs `{"items":[{"bucket","key"}, …]}` to
  `delete-flask-cache-batch.php` in chunks, instead of one HTTPS DELETE per
  video. `utils_cache.delete_from_lemmatized_subs_cache_many()` builds the
  lemma keys; a request failure is logged and swallowed.
- Deleting the lemma cache on delete also fixes id reuse: a new import that
  gets the recycled id starts from an empty cache.

### 4. Updates: only do the work that changed

- **Admin dialog**: send `subs_l2` only when the textarea actually changed.
  This stops title-only edits from de-indexing continua videos.
- **Server, `subs_l2` change**: (a) compute the n-gram tokens, (b) delete the
  lemma cache entry, (c) recompute `lex_div` / `word_freq` / `difficulty`
  **synchronously** from the new text. No stale scores: if the recompute
  raises, clear the three scores and report the error instead of keeping the
  old values. A single edit is rare and the import path already does this
  work; measure ja/zh and only move it to a bounded job if it exceeds the
  request budget.
- **Server, `l2` change** (supported): recompute the n-gram with the new
  language, delete the lemma cache and recompute the scores with the new
  language, and delete the embedding + set `needs_embedding` (the worker
  re-inserts with `l2 = excluded.l2`, moving the vector into the new
  language's partial HNSW index). The consolidated `id` does not change. The
  admin dialog may enable the L2 select for edits; the API already accepts it.
- Document the recompute as the explicit exception to ARCH-032's "never
  recompute an existing value" rule.

### 5. Bulk operations

- **Import** (single / batch / channel / playlist): n-gram computed inline
  (cheap); the insert sets `needs_embedding` (trigger); one revision bump per
  committed insert; the daily worker batches the embeddings, and **Update now**
  drains them on demand.
- **Bulk delete**: the `video_embeddings` FK cascade removes the vector; the
  video row (and its flag) is gone; one revision bump. The content delete
  commits first, then lemma cache entries are deleted in batches
  (`remote_cache.delete_many()` → `delete-flask-cache-batch.php`), so a slow
  cache host cannot hold the transaction open or roll the delete back.
- **Bulk assign** (TV show / talk): no derived artifact depends on these
  fields; deliberately no `needs_embedding` and no re-embeds.
- **Duplicate protection**: the `(youtube_id, l2)` unique index (SPEC-105)
  makes a race return `skipped/exists` (import) or `409` (admin create)
  instead of creating a second row.

### 6. Observability and admin controls

- `GET /admin/content-health` (admin-gated):
  - `needs_embedding` count, `embed_attempts >= 5` count, latest `embed_error`;
  - videos with no embedding for the current model, and continua rows with
    subtitles but NULL `subs_ngram_tsv` (report-only, no auto-flag);
  - current `content_revision` and the last successful worker run.
- `apps/admin` **Content health** panel with:
  - **Update embeddings now** — runs one bounded batch (≤ 100) through the same
    worker function; repeated clicks drain a backlog. Shows processed/failed.
  - **Reindex missing n-gram** — runs the backfill for the listed ids (or a
    bounded batch).
  - **Clear search cache** — bumps `content_revision` and deletes the local
    subs-search files.
- Alerting. "Page someone" means an alert a human must act on; a pager is
  overkill here. Thresholds: `needs_embedding > 1,000`,
  `embed_attempts >= 5` count > 20, or no successful worker run in 26 h → a red
  banner on the panel plus an email/log line. The channel (email vs Slack) is
  an open question; the panel is the primary surface.

## Phases

Each phase is independently shippable and reversible.

| Phase | Work | Result |
|---|---|---|
| 0 | Correct the docs listed below; run the one-time n-gram backfill (36 rows) and embed the 8 missing videos | current data correct |
| 1 | Shared tokenizer; n-gram on write; trigger fix; admin `subs_l2` dirty-check; tests | imports/edits indexed immediately |
| 2 | `content_revision`; cache envelope + revision check (optional TTL backstop); lemma-cache delete; `video_embeddings` FK cascade; tests | deletes/edits stop leaking through caches |
| 3 | `needs_embedding` columns + trigger + tracked embedding module + daily cron + **Update now** worker + report-only reconciliation | new/updated videos embedded within a day, or on demand |
| 4 | Content-health endpoint/panel (Update now, reindex missing n-gram, clear cache); alerting | the invariant is observable and recoverable |

All four phases are implemented; the only remaining ops step is installing
the daily crontab. Alert *delivery* (email/Slack) is not implemented — the
panel is the current surface.

## Verification

- **Unit**: `extract_tokens` parity with the backfill; n-gram set on insert and
  on `subs_l2` update; trigger preserves an explicit value and nulls an
  omitted one; `needs_embedding` set on insert and on each embedding-field
  update, not on `views`/`talk`; FK cascade on delete; cache revision
  invalidates an entry; lemma cache delete called on delete/edit; duplicate
  insert yields `skipped/exists` / `409`.
- **Integration** (staging DB): import a video → n-gram set immediately;
  metadata edit → embedding row gone + `needs_embedding = true`; worker run →
  embedding present with the new `l2`/model and the flag cleared; delete → no
  embedding, no flag, no lemma cache, revision bumped; a cached search request
  after a delete does not return the deleted video.
- **Operational**: backlog metrics return to zero after a bulk import; worker
  runtime and Gemini error rate stay within budget.

## Files

| File | Role |
|---|---|
| `zerotohero-python-server/utils_subs_ngram.py` | shared token extraction (new) |
| `zerotohero-python-server/utils_content.py` | `create_video` / `update_video` / `delete_video`, cache revision |
| `zerotohero-python-server/utils_video_import.py` | duplicate race handling; inline tokens |
| `zerotohero-python-server/utils_video_lemma.py` | cache invalidation / force recompute |
| `zerotohero-python-server/utils_cache.py`, `remote_cache.py` | revision-aware reads; `delete()` / `delete_many()` |
| `zerotohero-php-server/delete-flask-cache-batch.php` | batched cache-file delete on the shared host (new) |
| `zerotohero-python-server/utils_embeddings.py` | Gemini client, drain, flag-missing, health counts (new) |
| `zerotohero-python-server/scripts/maintain_derived_data.py` | drain / report / flag-missing / reindex-ngram (new) |
| `zerotohero-python-server/scripts/backfill_subs_ngram_tsv.py` | repair tool, unchanged behavior |
| `zerotohero-python-server/routes/admin.py` | content-health, run-embeddings, reindex-ngram, cache-bust; 409 on duplicate create |
| `apps/admin/src/lib/content-api.ts` | health/maintenance client functions |
| `apps/admin/src/components/content/video-dialog.tsx` | send `subs_l2` only when changed |
| `apps/admin/src/app/content/health/page.tsx` | content-health panel: Update now / reindex n-gram / clear cache (new) |
| `apps/admin/src/components/layout/nav-items.ts` | Content health nav item |
| `supabase/migrations/202610190004_video_derived_data.sql` | `needs_embedding` columns, triggers, revision, FK cascade |
| `docs/adr/0050-derived-content-data-maintenance.md` | the decision record |

## Risks

- **Trigger cost.** The embedding trigger fires on every insert and on the
  listed metadata columns only; the revision trigger is a single-row update.
  Both are cheap relative to transcript downloads, but measure on a bulk
  import.
- **Embedding gaps during the worker lag.** New/edited videos are absent from
  recommendations until the next daily run, or immediately via **Update now**.
  That is the intended “absent, never stale” trade-off.
- **Dirty flag scope.** One flag covers one artifact. If subtitle embeddings or
  a second model are added, upgrade to a `derived_jobs` table (one row per
  video/kind/model); the worker interface can stay the same.
- **Gemini quota/cost.** Batch 100 inputs per call, retry with backoff, and
  reconcile rather than re-embedding the catalog. The one-time 1M backfill
  cost ~CA$30; per-video re-embeds are negligible.
- **Two writers.** Triggers cover direct SQL and future services; the
  report-only reconciliation surfaces rows that bypassed them. A writer that
  disables triggers would still be invisible — the backstop is a manual review,
  not silence.
- **Cron dependence.** If the VPS crontab is removed or the script fails, the
  backlog grows silently. The health panel shows `needs_embedding` and the
  last successful run; the next daily run (or **Update now**) catches up. A
  failed run is retried the next day, not immediately.
- **Doc drift.** SPEC-096 currently documents “the n-gram index is not
  refreshed”; ADR-0021 documents a one-time embedding backfill. Both must be
  amended with this spec, not after it.

## Documentation to update (contradictions to resolve first)

- **SPEC-096** — remove the “ngram subtitle index is not refreshed” Known
  Limitation and resolve its Open Question; document the dirty flag and the
  409.
- **ADR-0021** — embeddings are maintained incrementally now; add the FK
  cascade and the “absent, never stale” rule.
- **SPEC-044 / ARCH-036** — replace “nightly backfill” with the inline path +
  the daily report-only reconciliation; document the cache revision and the
  long/optional TTL instead of “manual clearing only”.
- **SPEC-099** — document that only changed subtitles are sent, and that a
  subtitle edit re-indexes and re-scores.
- **ARCH-034** — its claim that a subtitle edit invalidates the whole-video
  entry is not what the code does; make it true or correct the doc.
- **New ADR** — “Derived content data maintenance (indexes, embeddings,
  caches)” so the invariant, not the individual scripts, is the design.

## Open Questions

Resolved 2026-10-19 (kept here so the reasoning is visible):

1. **Worker cadence and ownership.** Daily cron on the Flask VPS (the
   `prune_cache.py` pattern), plus the admin **Update now** action. The VPS
   administrator owns the crontab; the backend repo owns the script; the
   Content health panel owns visibility. `pg_cron` was considered and rejected
   (SQL-only; would need `pg_net`, a Vault secret and an HTTP hop).
2. **Acceptable latency.** ≤ 1 day for embeddings; immediate via **Update
   now**. Subs-search is immediate (inline n-gram), so it never waits for the
   worker.
3. **Rescoring.** Synchronous on a real `subs_l2` change; never serve stale
   scores. Clear the scores if recompute fails.
4. **Outbox vs dirty flag.** `needs_embedding` flag (plus
   attempts/error/requested_at). The outbox is unnecessary for one async
   artifact; use it if a second artifact/model is added.
5. **L2 changes.** Supported: re-index (n-gram), rescore, re-embed.
6. **Embedding model changes.** No change now. Keep the `model`/`kind` columns,
   per-language partial HNSW indexes and a config-driven worker so a future
   model is a versioned re-embed (new rows/indexes, switch `VECTOR_MODEL`, drop
   the old set), not a redesign. If two models must coexist, the flag becomes a
   per-model job table.
7. **Cache TTL.** The revision check is primary (every write bumps it); no
   24 h TTL. Keep a 30-day configurable backstop (`0` = indefinite), plus the
   admin cache-bust.
8. **Deploy backfill.** Manual one-off. The reconciliation report lists missing
   rows but does not auto-flag them.
9. **Alerting.** Thresholds: `needs_embedding > 1,000`, `embed_attempts >= 5`
   count > 20, no successful run in 26 h → panel banner + email/log. No pager.
10. **Retention.** 7 days for failed state and `backup.*_20261019`.
11. **Trigram.** Kept (SPEC-105); wildcard/space-term search keeps its index.
12. **Writers.** Triggers cover direct SQL and future services; the report is
    the backstop.

Still open:

- **Subtitle embeddings.** If ADR-0021's later phase happens, does `kind`
  become a second artifact and does the same worker handle it? (Likely yes, and
  the dirty flag upgrades to a job table.)
- **Alert channel.** Email, Slack, or panel banner only? Who receives it?
- **Admin reindex scope.** Should **Reindex missing n-gram** process only the
  listed rows, or allow a full-language rebuild from the panel?
- **Failed-row lifecycle.** After 5 attempts, does the row stay flagged forever
  (visible in the panel) or move to a separate failed list with a reset button?
- **Model migration procedure.** The exact cutover order (new rows → new HNSW
  indexes → recommender switch → drop the old set) when the model does change.
