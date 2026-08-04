# SPEC-038: Video Content — Directus MySQL → Supabase Postgres (Complete)

## Metadata
- **Spec ID**: SPEC-038
- **Feature**: Migrate the video content family from Directus 8 (MySQL, 14 shards) to one consolidated Supabase Postgres table with stable collision-free IDs
- **Status**: complete (2026-08-04) — data migration loaded and verified; the Flask read-path cutover is tracked separately in SPEC-039 (WS-5)
- **Created**: 2026-08-04 (split out of ADR-0021)
- **ROADMAP Phase**: Phase 9: Backend Consolidation
- **See also**: [ADR-0021 (Migrate Video Content)](../adr/0021-migrate-video-content-to-supabase.md), [SPEC-039 (Full Database Migration)](039-full-database-migration-supabase.md)

## Overview

Video metadata and subtitle CSVs lived in Directus 8 (MySQL), sharded into a
base table `youtube_videos` plus 13 language-group shards
`youtube_videos_2 … youtube_videos_14`. The family held **1,045,422 rows** and
roughly 15–18 GB, dominated by `subs_l1`/`subs_l2` CSV text. IDs were only
unique within each shard.

The data now lives in Supabase Postgres as one consolidated `youtube_videos`
table, plus 16 small content tables copied as-is. Two motivations drove the
move: pgvector embeddings for semantic recommendation (one queryable table, not
14 shards) and decoupling from Directus 8.

## Decision

Migrate the video content family to the Supabase project
(`tfugoojrqybaoukgpqza`, Postgres 17) as one consolidated `youtube_videos`
table.

### ID prefixing (fixed-width, not literal concatenation)

Every row's new ID derives from its source shard and old ID:

```text
new_id = prefix * 10^10 + old_id
source shard = new_id / 10^10
old_id       = new_id % 10^10
```

Prefixes 1–14 map to `youtube_videos` and `youtube_videos_2 … _14`. Fixed-width
10-digit blocks are collision-free (max old ID 204,018) and invertible — this is
the contract the tokenization/lemmatization cache and SPEC-039's
watch/likes/playlists remap rely on.

### Schema decisions

- **`subs_l1` is dropped** (regenerable via the translation pipeline; roughly
  half the data volume).
- `subs_l2` copied as-is (TOASTed, deliberately unindexed); MySQL ngram
  FULLTEXT search is not portable — embedding-based search is the intended
  replacement (SPEC-039).
- Small tables copied with **original IDs** — only `youtube_videos` is
  id-prefixed: `phrasebooks`, `youtube_channels`, `talks`, `tv_shows`,
  `articles`, `resources`, `pages`, `heroes`, `drills`, `exams`, `reading`,
  `communities`, `subreddits`, `tutoring_kit`, `unavailable_videos`,
  `languages`. References to channel ids (e.g. `youtube_videos.channel_id`)
  therefore need no transformation. The prefix exists **solely because 14
  shards with colliding auto-increment ids were concatenated into one table**;
  no single-source table requires it.
- **User-data tables were not migrated** (old per-shard video IDs; tracked in
  SPEC-039 with the remap).
- **Dictionaries stay on local SQLite** in the Flask server.
- **`l2` columns use ISO codes**, not Directus internal IDs
  (`'zh'`, not `7731`), converted via `code_by_lang_id()` with zero unmapped
  values.

## Migration Mechanics

- `python3.10` streaming bridge (`mysql.connector` → `psycopg2` COPY in text
  format): memory-bounded, no temp files, no row-by-row inserts.
- Chunked by ID range (Supabase pooler `statement_timeout = 2 min`).
- NUL bytes stripped (Postgres rejects `\x00`).
- Idempotent per source table (deletes its own prefix block, reloads).
- Verification by row count after every table.

Loader: `tmp/supabase-test/supabase-migrate.py` (project `python3.10` venv).

## Verification (complete)

- All 14 shards loaded at **1,045,422 rows — 100% match**.
- All 16 small tables matched row-for-row.
- `l2` conversion: 216 distinct IDs mapped, zero unmapped, zero row loss.
- Resulting `youtube_videos` ≈ 6.6 GB (after dropping `subs_l1`), comfortably
  inside the 50 GB disk.

## Consequences

- One global video table; no shard routing or per-language suffix lookup.
- Foundation for pgvector embeddings.
- Cache-compatible IDs via the deterministic transform.
- Self-describing language codes matching client `[l1]/[l2]` routes.

### Outstanding (tracked in SPEC-039)

- **Flask read-path cutover (WS-5)**: `routes/video.py`, `tv_shows.py`, and
  channel/talk lookups still read Directus; the data is in Supabase but not yet
  served from it.
- **Subs-search replacement** (pg_trgm interim / embeddings later).
- **User-data remap** (watch history, likes, playlists) via the ID contract.
