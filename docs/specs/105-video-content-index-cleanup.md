# SPEC-105: Video Content Index Cleanup & Schema Reproducibility

## Metadata

- **Spec ID**: SPEC-105
- **Feature**: Audit the `public.youtube_videos` index set, retire indexes that
  no query uses, replace the ones whose shape no longer matches their query,
  and make the surviving set reproducible from a tracked migration
- **Status**: complete (2026-10-19)
- **Created**: 2026-10-19
- **ROADMAP Phase**: Phase 9: Backend Consolidation
- **See also**:
  - [SPEC-038 — Video Content Supabase](038-video-content-supabase.md) — the table and its original schema decisions
  - [SPEC-039 — Full Database Migration](039-full-database-migration-supabase.md) — the interim pg_trgm index and the FTS cutover
  - [SPEC-044 — Subs-Search DB Optimizations](044-subs-search-db-optimizations.md) — FTS + `(l2, views)` walk + n-gram token index
  - [SPEC-045 / ADR-0026 — Continua n-gram indexing](<../adr/0026-continua-subs-search-indexing.md>)
  - [ARCH-036 — Subs-Search Architecture](../arch/036-subs-search-architecture.md)
  - [ARCH-037 — Video Content Schema & Index Inventory](../arch/037-video-content-schema.md)
  - [SPEC-107 — Tag Search and Video-Tag Pills](107-tag-search-and-video-tag-pills.md)
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
index, and tag search — user-facing since 2026-10-19 (SPEC-107) — has only a
btree that cannot serve `ILIKE '%tag%'`. The 6.2 GB trigram index is a
wildcard/space-term fallback and is deliberately **kept**. At the
same time, a true uniqueness constraint was missing: `(youtube_id, l2)` was
enforced only by application code, and 128 duplicate groups had accumulated
(see "Already applied" below).

This spec records the inventory, proposes the keep/drop/replace decisions, and
defines **one idempotent schema migration** that reproduces the surviving
index set.

## Current inventory

Measured from `pg_indexes` / `pg_stat_user_indexes` on 2026-10-19; scan counts
are cumulative since stats were last reset. The unique index was added by the
dedupe described below (its size is post-dedupe).

| Index | Columns / expression | Size | Scans | Verdict |
|---|---|---:|---:|---|
| `youtube_videos_pkey` | `id` | 27 MB | 34.5M | keep |
| `youtube_videos_youtube_id_l2_key` | `(youtube_id, l2)` unique | 31 MB | new | **keep (added 2026-10-19)** |
| `idx_youtube_videos_youtube_id` | `youtube_id` | 33 MB | 115k | **drop — prefix of the unique index** |
| `idx_youtube_videos_l2` | `l2` | 8.9 MB | 27.5M | keep |
| `idx_youtube_videos_l2_views` | `(l2, views desc nulls last)` | 21 MB | 30k | keep |
| `idx_youtube_videos_views` | `views` | 15 MB | 54k | **keep — used by the popular feed** (`views IS NOT NULL ORDER BY views DESC`) |
| `idx_youtube_videos_difficulty` | `difficulty` | 33 MB | 76k | keep |
| `idx_youtube_videos_tv_show` | `tv_show` | 8.3 MB | 109k | keep |
| `idx_youtube_videos_talk` | `talk` | 9.4 MB | 52k | keep |
| `idx_youtube_videos_channel_id` | `channel_id` | 11 MB | 4.4k | keep |
| `idx_youtube_videos_category` | `category` | 8.9 MB | 965 | keep |
| `idx_youtube_videos_lesson` | `lesson` | 8.2 MB | 2.6k | keep |
| `idx_youtube_videos_level` | `level` | 8.2 MB | 2.6k | keep |
| `youtube_videos_subs_tsv_idx` | `gin (to_tsvector(subs_tsv_config(l2), subs_l2))` | 2.3 GB | 1.8k | keep (word FTS) |
| `youtube_videos_subs_ngram_tsv_idx` | `gin (subs_ngram_tsv)` partial, continua | 1.1 GB | 16k | keep (continua FTS) |
| `youtube_videos_subs_l2_trgm_idx` | `gin (subs_l2 gin_trgm_ops)` | 6.2 GB | 2.3k | **keep — wildcard/space-term fallback; future grammar examples** |
| `youtube_videos_subs_l2_fts_ru_idx` | same FTS expression, `where l2='ru'` | 138 MB | 13 | **drop — duplicate of the global FTS index** |
| `idx_youtube_videos_tags` | `tags` btree | 128 MB | 0 | **drop/replace — tag search is user-facing; add a trigram GIN on `tags`** |
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

## Decisions (2026-10-19)

The open questions were reviewed with the product owner; the answers change
the proposed cleanup:

1. **Tag search is user-facing.** Web `#tag`, the mobile tag click and the
   watch-page tag pills route through `GET /search-videos?tag=…` →
   `tags ILIKE '%tag%'` ([SPEC-107](107-tag-search-and-video-tag-pills.md)).
   The `tags` btree cannot serve it, so it is replaced by
   `gin (tags gin_trgm_ops)`.
2. **Keep the `subs_l2` trigram index.** Wildcard (`*`, `?`, `_`) and
   space-containing terms ("space-terms") route to ILIKE; the n-gram tokens are
   split on `\S+` runs and cannot cross a space. A future grammar-example
   feature is expected to run many wildcard searches, so the 6.2 GB is kept as
   an investment rather than judged by today's scan count.
3. **Keep the single-column `views` index.** It is chosen for the popular feed
   (`views IS NOT NULL ORDER BY views DESC`) even with an `l2` filter
   (`Index Scan Backward using idx_youtube_videos_views`, 0.08–3.2 ms); the
   l2-scoped `views DESC NULLS LAST` and `views <` paths use `(l2, views)`.
4. **No partitioning.** The single-table set is sufficient for the expected
   growth.
5. **Schema inventory lives in [ARCH-037](../arch/037-video-content-schema.md)**,
   not ARCH-036 (which stays focused on subs-search routing).
6. **Retention: 7 days.** Drop `backup.*_20261019` on/after 2026-10-26 and
   keep failed maintenance state for 7 days (SPEC-106).

## Implementation (2026-10-19)

Applied on the live database:

- Built `idx_youtube_videos_tags_trgm` (235 MB, valid). Rare tags use it
  (`zoonotic`: bitmap index scan, ~2 ms); common tags still use the
  `(l2, views)` walk, which stops after the limit.
- Dropped the six retired indexes (`idx_youtube_videos_youtube_id`,
  `youtube_videos_subs_l2_fts_ru_idx`, `idx_youtube_videos_tags`,
  `idx_youtube_videos_date`, `idx_youtube_videos_topic`,
  `idx_youtube_videos_type`).
- Surviving content set: **16 indexes** (ARCH-037), plus the 16 kB
  SPEC-106 `needs_embedding` flag index (17 on the table in total). Verified
  plans: `(youtube_id, l2)` uses the unique index, Russian rare FTS uses the
  global `subs_tsv_idx`, and tag search uses the trigram for rare tags.
- Tracked migrations:
  `202610190002_video_content_indexes.sql` (keep set + tags trigram) and
  `202610190003_video_content_index_drops.sql` (drops); both validated
  statement-by-statement.
- The two-week observation window was skipped at the product owner's request;
  the drops rest on the recorded zero-scan / redundant evidence.
- Dropped the unused `subs_tsv` column (metadata-only; the 2,855 non-null
  values are in `backup.youtube_videos_subs_tsv_20261019` for 7 days).
- Per-language counts are now served live (see "Counts" below); the static
  maps are only a build-time / API-down fallback.

## Proposed cleanup

### Keep (15) + add (1) = 16 final

Primary key; unique `(youtube_id, l2)`; `l2`; `(l2, views)`; `views`;
`difficulty`; `tv_show`; `talk`; `channel_id`; `category`; `lesson`; `level`;
the two search GIN indexes (`subs_tsv_idx`, `subs_ngram_tsv_idx`); and the
trigram index (see below).

Final count: 21 current − 6 drops + 1 tags trigram = **16**.

### Drop (6, ~348 MB)

| Index | Reason |
|---|---|
| `idx_youtube_videos_youtube_id` | Redundant: `(youtube_id, l2)` has `youtube_id` as its leading column; equality and `= any(...)` lookups use the unique index. Verify with `EXPLAIN` before dropping. |
| `youtube_videos_subs_l2_fts_ru_idx` | A per-language subset of `youtube_videos_subs_tsv_idx`; no code references it. Drop after an `EXPLAIN` check that Russian rare-term searches use the global index. |
| `idx_youtube_videos_tags` | Tag search is user-facing (SPEC-107) but a btree cannot serve `ILIKE '%tag%'`; replaced by a trigram GIN. |
| `idx_youtube_videos_date` | `get_channel_videos` sorts by `date` within `channel_id` + `l2`; the planner uses those indexes and sorts the small result. |
| `idx_youtube_videos_topic` | No equality filter in `search_videos` or the admin list. |
| `idx_youtube_videos_type` | Only used as `coalesce(type,'') <>` (negation), which is not indexable. |

### Keep (1, 6.2 GB): the `subs_l2` trigram index

`youtube_videos_subs_l2_trgm_idx` was the interim subs-search index during
SPEC-039. Since SPEC-044 (word FTS) and SPEC-045 (continua n-gram tokens), it
serves wildcard and space-containing terms, Vietnamese's walk-timeout retry,
and the pre-migration fallback.

A **space-term** is a search term containing whitespace — e.g. `thank you`,
`por favor`, `おはよう ございます`. The n-gram tokens are extracted from
`\S+` runs, so they cannot match across a space; the routing sends any term
with whitespace (or a `*`/`?`/`_` wildcard) to `ILIKE`, and the trigram is the
only index that can serve that. Without it, the query scans the 13 GB
`subs_l2` TOAST — the pre-SPEC-044 ~42 s path.

The index is **kept** rather than measured against today's scan count: a
future grammar-example feature is expected to run many wildcard searches, and
there is no replacement wildcard path. Recorded in ARCH-037.

### Add (1): `gin (tags gin_trgm_ops)`

Tag search is user-facing since 2026-10-19
([SPEC-107](107-tag-search-and-video-tag-pills.md)): web `#tag`, the mobile tag
click and the watch-page tag pills call `GET /search-videos?tag=…`, which
filters `tags ILIKE '%tag%'`. The existing btree cannot serve a leading
wildcard.

Measured on 2026-10-19 on `en` (limit 50): `comedy` 5.6 ms (1,193 rows
filtered), `news` 34.7 ms (7,117 filtered) — the planner walks `(l2, views)`
and filters. A rare tag scans the whole language subset (155k rows for `en`).
Add:

```sql
create index concurrently if not exists idx_youtube_videos_tags_trgm
  on public.youtube_videos using gin (tags gin_trgm_ops);
```

The `pg_trgm` extension is already installed. Caveat: 1–2 character tags have
no usable trigram, so silent short tags remain a scan; if tag matching moves to
exact-token (`(',' || tags || ',') ILIKE '%,news,%'`) or a normalized
`video_tags` table, revisit this index (see SPEC-107's open question).

### Counts

`public.language_video_counts` (migration `202610190006`) is a materialized
view of `select l2, count(*)`, refreshed by the daily SPEC-106 worker and
served by `GET /stats/language-video-counts` (215 languages, keyed by ISO
code). The web landing merges the live counts over the fallback map, and the
fallback was refreshed to the 2026-10-19 values. No manual count regeneration
remains; the old `LANGUAGE_VIDEO_COUNT` dict in `utils_language.py` is marked
legacy.

## Tracked schema migration

The keep set lives in
`supabase/migrations/202610190002_video_content_indexes.sql`:

```sql
create index if not exists idx_youtube_videos_l2
  on public.youtube_videos (l2);
create index if not exists idx_youtube_videos_l2_views
  on public.youtube_videos (l2, views desc nulls last);
-- …the rest of the keep set, plus the GIN/FTS/ngram definitions…
create unique index if not exists youtube_videos_youtube_id_l2_key
  on public.youtube_videos (youtube_id, l2);
create index if not exists idx_youtube_videos_tags_trgm
  on public.youtube_videos using gin (tags gin_trgm_ops);
```

It is a no-op on the current database and creates everything on a fresh one.
`CREATE INDEX CONCURRENTLY` statements must run outside a transaction (psql
autocommit), so keep them in a separate section/file from the `BEGIN`-wrapped
DDL.

The **drops** live in `202610190003_video_content_index_drops.sql`; they
are destructive but reversible by rebuilding the index. The decisions are
recorded in [ARCH-037](../arch/037-video-content-schema.md).

## Verification

1. `pg_indexes` for `public.youtube_videos` matches the keep set exactly.
2. `pg_index.indisvalid` is true for every index (no half-built
   `CONCURRENTLY` leftovers).
3. `EXPLAIN` for: `(youtube_id, l2)` lookup, `l2 + views` walk, Russian rare
   term, zh 2-char term, a wildcard term, and `tags ILIKE` for a common and a
   rare tag (the latter should switch to the tags trigram).
4. `pg_stat_user_indexes` shows the dropped indexes gone and no new 0-scan
   index introduced after the observation window.
5. A fresh database built from the migrations has the same index inventory.

## Risks

- **Dropping an index a rare query needs.** The observation window plus
  `pg_stat_statements` review mitigates it; every drop is reversible by
  rebuilding.
- **`CONCURRENTLY` on Supabase.** Use a direct/session connection (the n-gram
  index was built that way); a transaction-mode pooler can wrap the statement
  and fail.
- **Tags trigram.** It accelerates 3+ character tags; 1–2 character tags still
  scan. If exact-token tag matching replaces substring matching, revisit the
  index shape.
- **Backup schema retention.** `backup.*_20261019` holds deleted rows and user
  references. Keep it for **7 days** (drop on/after 2026-10-26), then remove
  it in a maintenance window.

## Open Questions

- Should tag matching become exact-token (`(',' || tags || ',') ILIKE
  '%,news,%'`) rather than substring? That changes the index shape (a
  normalized `video_tags` table would be the long-term answer) — see SPEC-107.
- ~~Should the `subs_tsv` leftover column be dropped?~~ **Dropped 2026-10-19**
  (`202610190005_drop_subs_tsv.sql`); `DROP COLUMN` is metadata-only.
- ~~When should the six drops be executed?~~ **Applied 2026-10-19** at the
  product owner's request (see "Implementation").
- ~~Should `LANGUAGE_VIDEO_COUNT` be regenerated?~~ **Resolved 2026-10-19:**
  live counts come from `public.language_video_counts` via
  `GET /stats/language-video-counts`; the static maps are fallbacks.
- How long should `backup.*_20261019` be retained before it is dropped?

## Files

| File | Role |
|---|---|
| `supabase/migrations/202610190001_video_youtube_id_l2_unique.sql` | applied uniqueness migration |
| `supabase/migrations/202610190002_video_content_indexes.sql` | reproducible index set + tags trigram |
| `supabase/migrations/202610190005_drop_subs_tsv.sql` | drop the unused `subs_tsv` column |
| `supabase/migrations/202610190006_language_video_counts.sql` | per-language count matview |
| `zerotohero-python-server/routes/stats.py` | `GET /stats/language-video-counts` |
| `zerotohero-python-server/scripts/maintain_derived_data.py` | refreshes the count matview daily |
| `apps/web/src/components/landing/language-video-list.tsx` | merges live counts over the fallback |
| `apps/web/src/data/language-video-counts.ts` | build-time fallback (2026-10-19 values) |
| `docs/arch/036-subs-search-architecture.md` | subs-search routing (wildcards/space-terms) |
| `docs/arch/037-video-content-schema.md` | as-built schema + index inventory |
| `docs/specs/107-tag-search-and-video-tag-pills.md` | tag search feature that motivates the tags trigram |
| `zerotohero-python-server/utils_content.py` | `search_videos` / `subs_search` query shapes that justify each keep/drop |
| `zerotohero-python-server/utils_language.py` | legacy `LANGUAGE_VIDEO_COUNT` snapshot (no longer runtime source) |
