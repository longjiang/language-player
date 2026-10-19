# SPEC-105: Video Content Index Cleanup & Schema Reproducibility

## Metadata

- **Spec ID**: SPEC-105
- **Feature**: Audit the `public.youtube_videos` index set, retire indexes that
  no query uses, replace the ones whose shape no longer matches their query,
  and make the surviving set reproducible from a tracked migration
- **Status**: draft
- **Created**: 2026-10-19
- **ROADMAP Phase**: Phase 9: Backend Consolidation
- **See also**:
  - [SPEC-038 — Video Content Supabase](038-video-content-supabase.md) — the table and its original schema decisions
  - [SPEC-039 — Full Database Migration](039-full-database-migration-supabase.md) — the interim pg_trgm index and the FTS cutover
  - [SPEC-044 — Subs-Search DB Optimizations](044-subs-search-db-optimizations.md) — FTS + `(l2, views)` walk + n-gram token index
  - [SPEC-045 / ADR-0026 — Continua n-gram indexing](<../adr/0026-continua-subs-search-indexing.md>)
  - [ARCH-036 — Subs-Search Architecture](../arch/036-subs-search-architecture.md)
  - [SPEC-096 — Admin Video Ingestion](096-admin-video-ingestion.md)
  - [SPEC-106 — Derived Content Data Maintenance](106-derived-data-maintenance.md) — the write-side counterpart
  - [ADR-0028 — Consolidate ARB into AR](<../adr/0028-consolidate-arb-into-ar.md>) — the source of 119 of the 128 duplicate groups

## Overview

`public.youtube_videos` carries **21 indexes / ~10.2 GB** after the
uniqueness work (20 before it; see "Already applied") on a 20 GB table:
866 MB heap + 9.7 GB of `subs_l2` TOAST. They were created over three
different phases — the MySQL/Directus → Supabase migration, the SPEC-039 FTS
cutover, and the SPEC-044/045 subs-search work — and **none of the btree set
is defined in a tracked migration**. The live database is the only place the
full set exists, so a fresh environment built from the repo would have the
columns but not the indexes.

Several indexes are now shape-mismatched or unused: four btree indexes have
recorded zero scans, one 138 MB FTS index duplicates the global expression
index, and the 6.2 GB trigram index is now a wildcard-only fallback. At the
same time, a true uniqueness constraint was missing: `(youtube_id, l2)` was
enforced only by application code, and 128 duplicate groups had accumulated
(see "Already applied" below).

This spec records the inventory, proposes the keep/drop/replace decisions, and
defines **one idempotent schema migration** that reproduces the surviving
index set.

## Current inventory

Measured from `pg_indexes` / `pg_stat_user_indexes` on 2026-10-19, before the
128-row dedupe. Scan counts are cumulative since stats were last reset.

| Index | Columns / expression | Size | Scans | Verdict |
|---|---|---:|---:|---|
| `youtube_videos_pkey` | `id` | 27 MB | 34.5M | keep |
| `youtube_videos_youtube_id_l2_key` | `(youtube_id, l2)` unique | 31 MB | new | **keep (added 2026-10-19)** |
| `idx_youtube_videos_youtube_id` | `youtube_id` | 33 MB | 115k | **drop — prefix of the unique index** |
| `idx_youtube_videos_l2` | `l2` | 8.9 MB | 27.5M | keep |
| `idx_youtube_videos_l2_views` | `(l2, views desc nulls last)` | 21 MB | 30k | keep |
| `idx_youtube_videos_views` | `views` | 15 MB | 54k | keep (measure again after prefix index) |
| `idx_youtube_videos_difficulty` | `difficulty` | 33 MB | 76k | keep |
| `idx_youtube_videos_tv_show` | `tv_show` | 8.3 MB | 109k | keep |
| `idx_youtube_videos_talk` | `talk` | 9.4 MB | 52k | keep |
| `idx_youtube_videos_channel_id` | `channel_id` | 11 MB | 4.4k | keep |
| `idx_youtube_videos_category` | `category` | 8.9 MB | 965 | keep |
| `idx_youtube_videos_lesson` | `lesson` | 8.2 MB | 2.6k | keep |
| `idx_youtube_videos_level` | `level` | 8.2 MB | 2.6k | keep |
| `youtube_videos_subs_tsv_idx` | `gin (to_tsvector(subs_tsv_config(l2), subs_l2))` | 2.3 GB | 1.8k | keep (word FTS) |
| `youtube_videos_subs_ngram_tsv_idx` | `gin (subs_ngram_tsv)` partial, continua | 1.1 GB | 16k | keep (continua FTS) |
| `youtube_videos_subs_l2_trgm_idx` | `gin (subs_l2 gin_trgm_ops)` | 6.2 GB | 2.3k | **review — wildcard fallback only** |
| `youtube_videos_subs_l2_fts_ru_idx` | same FTS expression, `where l2='ru'` | 138 MB | 13 | **drop — duplicate of the global FTS index** |
| `idx_youtube_videos_tags` | `tags` btree | 128 MB | 0 | **drop — btree cannot serve `ILIKE '%tag%'`** |
| `idx_youtube_videos_date` | `date` | 31 MB | 0 | **drop — planner uses `channel_id`/`l2` then sorts** |
| `idx_youtube_videos_topic` | `topic` | 8.2 MB | 0 | **drop — no equality filter** |
| `idx_youtube_videos_type` | `type` | 8.3 MB | 0 | **drop — only `coalesce(type,'') <>`** |

`subs_tsv` is a leftover empty column (99.7% NULL) from an aborted ALTER and
has no index; drop it separately (see "Deferred").

## Already applied (2026-10-19)

The uniqueness work is a prerequisite for this spec, not a proposal:

- 128 duplicate `(youtube_id, l2)` groups were merged (119 `ar` groups from
  ADR-0028's `arb` → `ar` consolidation; 9 repeated imports/admin creates).
- Keeper policy: user references (likes/history/playlist) → completeness
  (subtitles, talk, show, views) → most views → lowest id. Missing fields were
  copied to the keeper; 2 like rows and 4 watch-history rows were remapped;
  no playlist entry referenced a dropped id; 128 embedding rows and 128 video
  rows were deleted.
- Backups: `backup.youtube_videos_dedupe_20261019`,
  `backup.user_likes_dedupe_20261019`,
  `backup.user_watch_history_dedupe_20261019`,
  `backup.user_playlists_dedupe_20261019`.
- `youtube_videos_youtube_id_l2_key` was created concurrently (valid, 31 MB);
  `EXPLAIN` shows an index scan for `(youtube_id, l2)` lookups.
- `POST /admin/videos` now returns `409` for an existing `(youtube_id, l2)`,
  and the import race reports `skipped/exists` instead of retrying an id.
- Migration: [`202610190001_video_youtube_id_l2_unique.sql`](../../supabase/migrations/202610190001_video_youtube_id_l2_unique.sql)
  (asserts no duplicates, then creates the index; psql-only because of
  `CONCURRENTLY`).

## Proposed cleanup

### Keep (14)

Primary key; unique `(youtube_id, l2)`; `l2`; `(l2, views)`; `views`;
`difficulty`; `tv_show`; `talk`; `channel_id`; `category`; `lesson`; `level`;
the two search GIN indexes (`subs_tsv_idx`, `subs_ngram_tsv_idx`).

### Drop (6, ~348 MB)

| Index | Reason |
|---|---|
| `idx_youtube_videos_youtube_id` | Redundant: `(youtube_id, l2)` has `youtube_id` as its leading column; equality and `= any(...)` lookups use the unique index. Verify with `EXPLAIN` before dropping. |
| `youtube_videos_subs_l2_fts_ru_idx` | A per-language subset of `youtube_videos_subs_tsv_idx`; no code references it. Drop after an `EXPLAIN` check that Russian rare-term searches use the global index. |
| `idx_youtube_videos_tags` | `search_videos` filters `tags ILIKE '%tag%'`; a btree cannot serve a leading wildcard. |
| `idx_youtube_videos_date` | `get_channel_videos` sorts by `date` within `channel_id` + `l2`; the planner uses those indexes and sorts the small result. |
| `idx_youtube_videos_topic` | No equality filter in `search_videos` or the admin list. |
| `idx_youtube_videos_type` | Only used as `coalesce(type,'') <>` (negation), which is not indexable. |

### Review (1, 6.2 GB): the trigram index

`youtube_videos_subs_l2_trgm_idx` was the interim subs-search index during
SPEC-039. Since SPEC-044 (word FTS) and SPEC-045 (continua n-gram tokens), it
serves only wildcard/space-containing terms, Vietnamese's walk-timeout retry,
and the pre-migration fallback. It is not dead — it is the only index that can
serve `*`/`?` queries — but 6.2 GB for 2.3k scans is expensive.

Decision gate (do not drop yet):

1. Measure wildcard/space query volume and p95 latency for two weeks.
2. If it is negligible, either (a) drop the index and accept bounded ILIKE
   scans for wildcard queries, or (b) replace it with a smaller partial
   index if the wildcard terms concentrate in a few languages.
3. If it is not negligible, keep it and record why in ARCH-036.

### Replace (optional): tag search

If tag filtering is a real product feature, a btree cannot help. The options
are a `gin (tags gin_trgm_ops)` index (supports `ILIKE '%tag%'`, same trigram
caveats for 1–2 char tags) or a normalized `video_tags` table. Do not add
either until tag-search latency is measured.

### Deferred

- Drop the leftover `subs_tsv` column (99.7% NULL, no index) in a maintenance
  window; it needs a table rewrite / `VACUUM FULL` to reclaim space.
- Refresh `LANGUAGE_VIDEO_COUNT` (`utils_language.py`) and the generated web
  counts. They are already stale beyond the dedupe (e.g. `en` map 164,069 vs
  live 155,002; `zh` 139,167 vs 121,840), so a manual subtraction would be
  misleading — regenerate them from the database instead.
- Re-check `idx_youtube_videos_views` after the unique index exists; if the
  planner always uses `(l2, views)`, it may be droppable too.

## Tracked schema migration

Create **one idempotent file**, e.g.
`supabase/migrations/202610190002_video_content_indexes.sql`, that defines the
surviving set:

```sql
create index if not exists idx_youtube_videos_l2
  on public.youtube_videos (l2);
create index if not exists idx_youtube_videos_l2_views
  on public.youtube_videos (l2, views desc nulls last);
-- …the rest of the keep set, plus the GIN/FTS/ngram definitions…
create unique index if not exists youtube_videos_youtube_id_l2_key
  on public.youtube_videos (youtube_id, l2);
```

It is a no-op on the current database and creates everything on a fresh one.
`CREATE INDEX CONCURRENTLY` statements must run outside a transaction (psql
autocommit), so keep them in a separate section/file from the `BEGIN`-wrapped
DDL.

The **drops** are a separate, reviewed migration (they are destructive and
irreversible except by rebuild). Add them only after the two-week observation
window, and record the decision in ARCH-036.

## Verification

1. `pg_indexes` for `public.youtube_videos` matches the keep set exactly.
2. `pg_index.indisvalid` is true for every index (no half-built
   `CONCURRENTLY` leftovers).
3. `EXPLAIN` for: `(youtube_id, l2)` lookup, `l2 + views` walk, Russian rare
   term, zh 2-char term, and a wildcard term.
4. `pg_stat_user_indexes` shows the dropped indexes gone and no new 0-scan
   index introduced after two weeks.
5. A fresh database built from the migrations has the same index inventory.

## Risks

- **Dropping an index a rare query needs.** The two-week scan window plus
  `pg_stat_statements` review mitigates it; every drop is reversible by
  rebuilding.
- **`CONCURRENTLY` on Supabase.** Use a direct/session connection (the n-gram
  index was built that way); a transaction-mode pooler can wrap the statement
  and fail.
- **The trigram decision.** Dropping it makes wildcard searches slow; keeping
  it costs 6.2 GB. Measure before deciding.
- **Backup schema retention.** `backup.*_20261019` holds deleted rows and user
  references. Keep it until the dedupe is verified, then drop it in a
  maintenance window.

## Open Questions

- ~~Is tag search (`tags ILIKE`) a real user-facing feature?~~ **Answered
  2026-10-19 (SPEC-107):** yes. Tag searches are now first-class in web and
  mobile — the search tag cloud, `#tag` queries, and the watch page's tag pills
  all route through `GET /search-videos?tag=…`. That decides whether a trigram
  index on `tags` is worth it; re-measure latency before adding one.
- How much wildcard/space-term traffic does subs-search actually see? The
  trigram decision depends on it.
- Is the single-column `views` index still chosen after the unique index and
  the `(l2, views)` composite are in place?
- Should the schema inventory live in ARCH-036 (subs-search only), a new
  `docs/arch/037-video-content-schema.md`, or an "as-built schema" section in
  SPEC-038? ARCH-036 is the wrong home for the content btree indexes.
- Do we need a partitioned index strategy if the table keeps growing, or is
  the current single-table set sufficient?

## Files

| File | Role |
|---|---|
| `supabase/migrations/202610190001_video_youtube_id_l2_unique.sql` | applied uniqueness migration |
| `supabase/migrations/202610190002_video_content_indexes.sql` | proposed reproducible index set |
| `docs/arch/036-subs-search-architecture.md` | search-index routing; needs the cleanup decisions |
| `docs/arch/037-video-content-schema.md` | proposed as-built inventory (create) |
| `zerotohero-python-server/utils_content.py` | `search_videos` / `subs_search` query shapes that justify each keep/drop |
| `zerotohero-python-server/utils_language.py` | stale `LANGUAGE_VIDEO_COUNT` to regenerate |
