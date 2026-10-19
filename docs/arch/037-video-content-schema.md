# Video Content Schema & Index Inventory

## Metadata

- **Arch ID**: ARCH-037
- **Feature**: As-built schema, indexes, constraints and search routing for
  `public.youtube_videos` (the video content table)
- **Type**: as-built / schema
- **Status**: accepted
- **Created**: 2026-10-19
- **Last Updated**: 2026-10-19
- **ROADMAP Phase**: Phase 9: Backend Consolidation
- **Scope**: Python (Flask) backend, Supabase Postgres
- **See also**:
  - [SPEC-038 — Video Content Supabase](../specs/038-video-content-supabase.md) — the MySQL → Supabase load and the id contract
  - [SPEC-039 — Full Database Migration](../specs/039-full-database-migration-supabase.md) — the interim trigram/FTS cutover
  - [SPEC-044 — Subs-Search DB Optimizations](../specs/044-subs-search-db-optimizations.md) and [SPEC-045 / ADR-0026](../adr/0026-continua-subs-search-indexing.md) — the FTS and n-gram indexes
  - [ARCH-036 — Subs-Search Architecture](036-subs-search-architecture.md) — query routing for `subs_l2`
  - [SPEC-105 — Video Content Index Cleanup](../specs/105-video-content-index-cleanup.md) — the applied index drops/replacements
  - [SPEC-106 — Derived Content Data Maintenance](../specs/106-derived-data-maintenance.md) — the write-side maintenance
  - [ADR-0021 — Migrate Video Content to Supabase](../adr/0021-migrate-video-content-to-supabase.md) — `video_embeddings`

## Overview

`public.youtube_videos` is the single source of truth for video content. Every
row is one YouTube video **in one language** (L2); the same YouTube video can
appear once per language, but not twice in the same language. The table carries
metadata, the L2 subtitle CSV, difficulty metrics and the derived search
vectors, and it is read by the watch page, Explore, the dictionary
"Examples" tab (subs-search), recommendations and the admin console.

This document is the **as-built** inventory: columns, constraints, the 21
indexes with their sizes and current roles, the search routing that consumes
them, and the known gaps. It is deliberately a schema document, not a
subs-search design doc — query routing lives in
[ARCH-036](036-subs-search-architecture.md), and the cleanup record lives in
[SPEC-105](../specs/105-video-content-index-cleanup.md).

## Context

The table was consolidated from 14 MySQL shards into one Postgres table
([SPEC-038](../specs/038-video-content-supabase.md)). Since then:

- [SPEC-039](../specs/039-full-database-migration-supabase.md) added the
  interim **trigram** index on `subs_l2` so `ILIKE` could serve subs-search.
- [SPEC-044](../specs/044-subs-search-db-optimizations.md) added the
  **full-text expression index** and the **`(l2, views)`** walk for word-based
  languages.
- [SPEC-045 / ADR-0026](../adr/0026-continua-subs-search-indexing.md) added
  the **n-gram token index** (`subs_ngram_tsv`) for continua languages.
- 2026-10-19: 128 duplicate `(youtube_id, l2)` groups were merged and
  **`youtube_videos_youtube_id_l2_key`** was added
  ([SPEC-105](../specs/105-video-content-index-cleanup.md)).

The btree indexes below were created outside any tracked migration (the live
database is the only record); SPEC-105 proposes making the surviving set
reproducible.

## Schema

Row count: **1,045,301**; heap **866 MB**, indexes **~10.2 GB**, total
**~20 GB** (of which ~9.7 GB is `subs_l2` TOAST).

| Column | Type | Null | Role |
|---|---|---|---|
| `id` | `bigint` (identity) | no | Consolidated id: `prefix * 10^10 + old_id` (SPEC-038). The prefix identifies the source shard/language block. |
| `status` | `varchar` | yes | Editorial status (`draft`, …); imports write `draft`. |
| `owner` | `integer` | yes | Legacy Directus owner. |
| `created_on` | `timestamptz` | yes | YouTube publish timestamp (not the row-insert timestamp). |
| `youtube_id` | `varchar` | yes | YouTube video id, `[A-Za-z0-9_-]{11}`. |
| `title` | `varchar` | yes | Video title. |
| `topic` | `varchar` | yes | Legacy topic label. |
| `level` | `varchar` | yes | Lesson/level label (legacy; distinct from the difficulty-derived level). |
| `subs_l2` | `text` | yes | L2 transcript CSV: `starttime,duration,line` (quoted lines may contain commas/newlines). |
| `lesson` | `varchar` | yes | Lesson id/label. |
| `channel_id` | `varchar` | yes | `youtube_channels` id (no FK). |
| `date` | `timestamptz` | yes | Publish date. |
| `notes` | `text` | yes | Free-form admin notes. |
| `l2` | `text` | yes | ISO language code (`zh`, `ja`, …). Drives which search index applies. |
| `tv_show` | `bigint` | yes | `tv_shows` id (no FK). |
| `talk` | `bigint` | yes | `talks` id (no FK). |
| `lex_div` | `real` | yes | MTLD lexical diversity ÷ 1000 (ARCH-032). |
| `views` | `integer` | yes | YouTube view count, refreshed on import. |
| `tags` | `varchar` | yes | Comma-separated YouTube tags. Tag search uses `tags ILIKE '%tag%'`. |
| `made_for_kids` | `smallint` | yes | 0/1. |
| `category` | `integer` | yes | YouTube category id. |
| `likes` | `integer` | yes | YouTube like count. |
| `comments` | `integer` | yes | YouTube comment count. |
| `locale` | `varchar` | yes | Declared audio locale. |
| `duration` | `varchar` | yes | Raw ISO-8601 (`PT3M44S`); nothing parses it at write time. |
| `word_freq` | `real` | yes | Mean Zipf frequency of the unique lemmas (ARCH-032). |
| `difficulty` | `real` | yes | `lex_div / word_freq` (ARCH-032/033). |
| `type` | `varchar` | yes | Content type (`other`, …). |
| `subs_ngram_tsv` | `tsvector` | yes | Continua token vector (unique 1-char + 2-char tokens from `subs_l2`, `line` column only), computed inline on write (SPEC-106). |
| `needs_embedding` | `boolean` | no | SPEC-106 dirty flag; a trigger sets it on insert and on embedding-field updates. |
| `embed_attempts` | `integer` | no | Failed drain attempts (>= 5 is shown in the health panel). |
| `embed_error` | `text` | yes | Last embedding failure. |
| `embed_requested_at` | `timestamptz` | yes | Drain ordering / when the work was queued. |

### Constraints & identity

- `youtube_videos_pkey` on `id`.
- **No foreign keys** on `channel_id`, `tv_show`, `talk` (legacy tables were
  copied independently).
- **`youtube_videos_youtube_id_l2_key`** — unique index on
  `(youtube_id, l2)`, added 2026-10-19. The same YouTube video may exist under
  different languages; a second row under the same language is rejected.
  Application handling: `POST /admin/videos` → `409`, import race →
  `skipped` / `exists`.
- `id` is `GENERATED BY DEFAULT AS IDENTITY`, but `next_video_id()` allocates
  `prefix * 10^10 + max(id in block) + 1` explicitly. Deleting the newest row
  makes the next import reuse its id (SPEC-106 deletes the lemma cache on
  delete for that reason).

## Index inventory (16 content + 1 maintenance)

Measured 2026-10-19 after the dedupe and the SPEC-105 cleanup. Scan counts are
cumulative since stats were last reset.

| Index | Definition | Size | Role |
|---|---|---:|---|
| `youtube_videos_pkey` | `(id)` unique | 27 MB | primary key |
| `youtube_videos_youtube_id_l2_key` | `(youtube_id, l2)` unique | 31 MB | dedupe; also serves `youtube_id` lookups |
| `idx_youtube_videos_l2` | `(l2)` | 8.9 MB | language filter |
| `idx_youtube_videos_l2_views` | `(l2, views desc nulls last)` | 21 MB | subs-search walk; l2-scoped `views desc nulls last`; `views <` filter |
| `idx_youtube_videos_views` | `(views)` | 15 MB | popular feed `views IS NOT NULL ORDER BY views DESC` (chosen even with an `l2` filter — do not drop without re-testing that path) |
| `idx_youtube_videos_difficulty` | `(difficulty)` | 33 MB | level/difficulty filters |
| `idx_youtube_videos_tv_show` | `(tv_show)` | 8.3 MB | show pages |
| `idx_youtube_videos_talk` | `(talk)` | 9.4 MB | talk pages |
| `idx_youtube_videos_channel_id` | `(channel_id)` | 11 MB | channel pages/import |
| `idx_youtube_videos_category` | `(category)` | 8.9 MB | category filters |
| `idx_youtube_videos_lesson` | `(lesson)` | 8.2 MB | lesson filters |
| `idx_youtube_videos_level` | `(level)` | 8.2 MB | level filters |
| `idx_youtube_videos_tags_trgm` | `gin (tags gin_trgm_ops)` | 235 MB | tag search (`tags ILIKE '%tag%'`); rare tags use it, common tags use `(l2, views)` |
| `youtube_videos_subs_tsv_idx` | `gin (to_tsvector(subs_tsv_config(l2), subs_l2))` | 2.3 GB | word-language FTS |
| `youtube_videos_subs_ngram_tsv_idx` | `gin (subs_ngram_tsv)` partial, 29 continua languages | 1.1 GB | continua FTS |
| `youtube_videos_subs_l2_trgm_idx` | `gin (subs_l2 gin_trgm_ops)` | 6.2 GB | wildcard (`*`, `?`, `_`) and whitespace ("space-term") searches; retained deliberately (a future grammar-example feature may rely on it) |
| `youtube_videos_needs_embedding_idx` | partial `(embed_requested_at) where needs_embedding` | 16 kB | SPEC-106 drain queue (not part of the content/search set) |

Six indexes were dropped on 2026-10-19: `idx_youtube_videos_youtube_id`
(prefix of the unique index), `youtube_videos_subs_l2_fts_ru_idx` (duplicate
of the global FTS index), `idx_youtube_videos_tags` (btree cannot serve
`ILIKE '%tag%'`; replaced by the trigram), and the zero-scan `date`, `topic`
and `type` btrees. The reproducible keep set is
`supabase/migrations/202610190002_video_content_indexes.sql`; the drops are in
`202610190003_video_content_index_drops.sql`.

## Search routing (summary)

`public.subs_tsv_config(l2)` returns a per-language text-search config, or
`NULL` for continua languages. Routing:

| Term shape | Word languages | Continua |
|---|---|---|
| 1 char | lexeme (subject to that language's stopwords) | single-char token in `subs_ngram_tsv` |
| 2 chars | lexeme (word/stem, not substring) | bigram token |
| 3+ chars | stemmed lexemes, word boundaries | AND of overlapping bigrams, then a literal recheck |
| `*`, `?`, `_`, or whitespace | ILIKE + trigram | ILIKE + trigram (n-gram tokens cannot cross a space) |

Full routing, the two-phase query and the fallbacks are in
[ARCH-036](036-subs-search-architecture.md). Tag search is a separate path:
`search_videos(tag=…)` filters `tags ILIKE '%tag%'`; today it walks
`(l2, views)` and filters, which is 5–35 ms for common tags on `en` but scans
the whole language subset for a rare tag — hence the tags trigram.

## Related tables

| Table | Relationship | Notes |
|---|---|---|
| `video_embeddings` | `video_id` → `youtube_videos.id` **ON DELETE CASCADE** | PK `(video_id, model, kind)`; metadata embedding `gemini-embedding-2@1024`; `l2` denormalized; per-language partial HNSW indexes `video_embeddings_hnsw_l2_*`; `updated_at`. |
| `youtube_channels` | `youtube_videos.channel_id` | No FK; channel import resolves the id. |
| `tv_shows`, `talks` | `tv_show`, `talk` | No FK; shows aggregate member videos. |
| `unavailable_videos` | legacy YouTube-id list | Empty in practice. |
| `user_likes`, `user_watch_history` | `video_id` | No FK to `youtube_videos`; a delete does not cascade (the API deletes the embedding explicitly). |
| `user_playlists.videos` | JSONB `[{id, title, duration, youtube_id}]` | No FK; ids are strings. |
| `content_revision` | one row (`id = 1`) | Bumped by a statement trigger on every `youtube_videos` write; the subs-search cache compares `saved_at` to `updated_at`. |
| `maintenance_runs` | ledger | Worker/Update-now rows: kind, started/finished, processed, failed, detail. |

## Write paths & derived data

All writes go through `utils_content.create_video` / `update_video` /
`delete_video` (admin CRUD, import, sweep, bulk loops). Derived artifacts:

- **Postgres indexes** — maintained automatically.
- **`subs_ngram_tsv`** — computed inline in `create_video` / `update_video`
  (shared `utils_subs_ngram.py`); the trigger keeps an explicit value and
  nulls an omitted one. `backfill_subs_ngram_tsv.py` remains the repair tool.
- **`video_embeddings`** — the trigger sets `needs_embedding`; a daily VPS
  worker (`scripts/maintain_derived_data.py`) or the admin **Update now**
  action drains it and upserts the vector. The old vector is deleted on a
  metadata/L2 update ("absent, never stale").
- **lemmatization cache** — deleted on subtitle/L2 change and on video delete;
  the edit path recomputes the scores synchronously.
- **subs-search result cache** — entries store `{saved_at, videos}`; a read is
  a miss when `saved_at < content_revision.updated_at` (5 s in-process cache)
  or older than the 30-day configurable backstop (`0` = indefinite). Admin
  **Clear search cache** bumps the revision and removes the local files.

## Migration history

| Date | Change |
|---|---|
| 2026-08-04 | MySQL shards → Supabase; `subs_l2` loaded unindexed (SPEC-038) |
| 2026-08-04/05 | pg_trgm GIN on `subs_l2`; FTS expression index + `(l2, views)` (SPEC-039/044) |
| 2026-08-08 | `arb` → `ar` consolidation (ADR-0028), source of 119 duplicate groups |
| 2026-08-14 | n-gram partial GIN + trigger + backfill (SPEC-045) |
| 2026-10-19 | 128 duplicate groups merged; `(youtube_id, l2)` unique index; tag search UI shipped; SPEC-105 index cleanup (tags trigram, 6 drops → 16 indexes); SPEC-106 derived-data migration; unused `subs_tsv` column dropped (2,855 non-null values backed up for 7 days) |

## Operations / verification

```sql
-- inventory
select c.relname, pg_size_pretty(pg_relation_size(i.indexrelid))
from pg_index i join pg_class c on c.oid = i.indexrelid
join pg_class t on t.oid = i.indrelid
where t.relname = 'youtube_videos' order by 2 desc;

-- duplicates (must be 0)
select count(*) from (
  select youtube_id, l2 from public.youtube_videos
  group by 1,2 having count(*) > 1) d;

-- index validity
select c.relname, i.indisvalid, i.indisunique from pg_index i
join pg_class c on c.oid = i.indexrelid
where i.indrelid = 'public.youtube_videos'::regclass;

-- usage (cumulative)
select indexrelname, idx_scan from pg_stat_user_indexes
where relname = 'youtube_videos' order by idx_scan;
```

## Known issues / follow-ups

- The trigram index is 6.2 GB for wildcard/space queries; retained for the
  future grammar-example feature (SPEC-105).
- 106 continua rows still have `subs_ngram_tsv = NULL`; their `subs_l2` has no
  tokenizable `line` text (empty/blank), so they are NULL by design.
- All videos now have an embedding (the 8 missing `zh` rows were embedded on
  2026-10-19); `--report` shows 0 pending / 0 missing.
- `LANGUAGE_VIDEO_COUNT` / web counts are stale and need a full regeneration,
  not a per-write update (SPEC-105).
- The admin dialog still re-sends `subs_l2` on every save; the server-side
  recompute keeps the data correct, but the dirty-check is a follow-up.
- The daily maintenance crontab is not installed yet (ops step; the admin
  **Update now** action works without it).
