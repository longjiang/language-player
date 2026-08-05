# ADR-0021 — Migrate Video Content from Directus MySQL to Supabase Postgres

**Date**: 2026-08-02
**Status**: accepted

## Context

Video metadata and subtitle CSVs live in Directus 8 (MySQL), sharded into a base
table `youtube_videos` plus 13 language-group shards `youtube_videos_2` …
`youtube_videos_14` (see `docs/specs/004-phase3-explore-video.md`). The family
holds 1,045,422 rows and roughly 15–18 GB, dominated by the `subs_l1`/`subs_l2`
CSV text columns. IDs are only unique **within** each shard: every shard has its
own auto-increment `id`, and cross-shard references (watch history, likes) are
resolved by joining within the correct shard for the language.

Two motivations drove a move:

1. **Vector embeddings for video recommendation.** The next phase is embedding
   video content (titles, metadata, subtitles) for semantic recommendation.
   Postgres + pgvector on Supabase is the intended home for embeddings, and
   vector search over all videos requires one queryable table, not 14 shards.
2. **Future-proofing / decoupling from Directus.** Directus 8 is aging and the
   eventual migration to Directus 11 or another backend is anticipated. The
   architecture rule is that clients never touch Directus directly — data flows
   through the Flask API. A consolidated Postgres copy gives the backend a direct
   SQL store that does not depend on the CMS.

The video tokenization/lemmatization cache already built (`utils_video_lemma.py`,
see `docs/arch/017-tokenization-batch-lookup-pipeline.md`) keys on video IDs.
Consolidating the shards requires a **stable, collision-free ID scheme** so that
any old `(shard, id)` pair maps deterministically to the new ID — keeping the
cache bindable without ambiguity.

Dictionaries (`wiktionary`, `edict`, `kengdic`, `hsk_cedict`, `hanjas`) are
**not** part of this migration: the Python server now serves them from local
SQLite databases.

## Decision

Migrate video content from Directus MySQL to a Supabase Postgres 17 instance
(project `tfugoojrqybaoukgpqza`, us-east-2, Small compute, 50 GB disk), as one
consolidated table `youtube_videos`.

### ID prefixing (fixed-width, not literal concatenation)

Every row's new ID is derived from its source shard and old ID:

| Source table | Prefix | New ID formula |
|---|---|---|
| `youtube_videos` (base) | 1 | `1 * 10^10 + old_id` |
| `youtube_videos_2` | 2 | `2 * 10^10 + old_id` |
| … | … | … |
| `youtube_videos_14` | 14 | `14 * 10^10 + old_id` |

**Why fixed-width:** literal string concatenation collides. `youtube_videos` old
ID `15` would produce `115`, and `youtube_videos_11` old ID `5` would also
produce `115`. The 10-digit fixed-width blocks are collision-free (max old ID in
the source data is 204,018, far below `10^10`) and the mapping is invertible:

```
source shard = new_id / 10^10
old_id       = new_id % 10^10
```

This is the contract the tokenization/lemmatization cache relies on: cache
entries keyed on old per-shard IDs can be rebound to the consolidated table with
the same deterministic transformation, with no ambiguity about which shard an ID
came from.

### Schema decisions

- **`subs_l1` is dropped.** It holds roughly half the data volume and is
  regenerable through the existing translation pipeline.
- `subs_l2` is copied as-is (CSV text, TOASTed by Postgres) and is deliberately
  **not** indexed. MySQL's ngram FULLTEXT search on `subs_l2`
  (`docs/arch/004-subs-search-architecture.md`) is not portable to Postgres in
  this migration; embedding-based search is the intended replacement.
- Non-video content tables are copied **as-is with their original IDs**:
  `phrasebook → phrasebooks`, `youtube_channels`, `talks`, `tv_shows`,
  `articles`, `resources`, `pages`, `heroes`, `drills`, `exams`, `reading`,
  `communities`, `subreddits`, `tutoring_kit`, `unavailable_videos`,
  `languages`. These reference each other with unchanged IDs (e.g.,
  `phrasebook.tv_show → tv_shows.id`), so consistency is preserved.
- **User-data tables are not migrated yet.** `user_watch_history`,
  `user_likes`, `playlists`, and `user_data` store old per-shard video IDs and
  require the prefix remap (via `l2` → source shard → prefix) before they can be
  brought over correctly.
- **Dictionaries stay on local SQLite** in the Python server; nothing from the
  MySQL dictionary tables is migrated.

### Language IDs (`l2`) use ISO codes, not Directus internal IDs

All `l2` columns in the migrated tables store **ISO codes** instead of Directus
internal language IDs (e.g., `'zh'`, not `7731`). The conversion uses the Flask
server's `code_by_lang_id()` logic (`data/languages.csv`):
`iso639-1 → iso639-3 → glottologId` fallback.

- Applied post-import to all 11 Supabase tables that carry an `l2` column
  (`youtube_videos`, `phrasebooks`, `youtube_channels`, `talks`, `tv_shows`,
  `articles`, `drills`, `exams`, `reading`, `resources`, `subreddits`).
- The languages catalog has **no duplicate codes** (verified across all 26,054
  rows), so the ID → code mapping is globally unique and cannot conflate
  languages. `youtube_videos` holds 216 distinct IDs, all mapped; the conversion
  was verified with zero unmapped values and no row loss.
- Codes are two-letter ISO 639-1 where available, else three-letter ISO 639-3
  (e.g., `'nan'` for Min Nan) or a glottolog ID.
- **Rationale**: codes are self-describing, match the `[l1]/[l2]` route params
  web and mobile already use, simplify backend queries (filter by code instead
  of translating via `lang_id_by_code()`), and are immune to Directus ID drift
  when the CMS is eventually replaced.
- The MySQL source keeps internal IDs until the backend cutover; the user-data
  tables will apply the same `l2` conversion on import, and the video-ID remap
  becomes `code → source shard → prefixed ID`.

### Migration mechanics (recorded for reproducibility)

- A `python3.10` streaming bridge (`mysql.connector` → `psycopg2 COPY` in text
  format) transfers data memory-bounded with no temp files and no row-by-row
  inserts.
- Copies are **chunked by ID range** because the Supabase pooler enforces
  `statement_timeout = 2 min` on long statements.
- NUL bytes (`\x00`), which MySQL tolerates but Postgres rejects, are stripped
  during copy.
- The loader is **idempotent per source table** (deletes its own prefix block in
  the target, then reloads), and every table is verified by row count. All 14
  shards loaded at 1,045,422 rows with 100% match; all 16 small tables matched
  as well.
- The throwaway loader lives at `tmp/supabase-test/supabase-migrate.py`
  (run with the project's `python3.10` venv).

### Metadata embeddings for vector recommendation

All 1,045,422 videos across 216 languages now carry a metadata embedding in a
dedicated `video_embeddings` table (pgvector), providing the content-similarity
foundation for the next-phase vector recommender and a future replacement for
subtitle FULLTEXT search.

- **Model**: Google `gemini-embedding-2` at **1024 dimensions** (Matryoshka
  reducible; 512 is derivable by slicing the stored vectors, no re-embed
  needed). Model + dims are recorded per row (`gemini-embedding-2@1024`), so a
  provider or dimension change is a clean, versioned re-embed.
- **Input text**: title, tags, topic, YouTube category name, channel title,
  locale, level, type — metadata only. Subtitle embeddings are a separate,
  later phase.
- **Storage**: `video_embeddings(video_id, model, kind='metadata',
  embedding vector(1024))` with an HNSW cosine index. ~13 GB (vectors + index)
  on the 50 GB disk. As of 2026-08-04 the table also carries an `l2` text
  column (backfilled from `youtube_videos`, auto-filled by a before-insert
  trigger), and the single global HNSW index was replaced with per-language
  partial HNSW indexes (`video_embeddings_hnsw_l2_*`) so vector search can be
  scoped to one language instead of scanning the global 216-language neighbor
  set (see `migrate_embedding_l2_indexes.py`).
- **Coverage**: 100% of videos embedded (1,045,422/1,045,422), zero missing
  languages; verified by count and similarity spot-checks (e.g., Chinese drama
  episodes cluster at 0.96+ cosine similarity).
- **Provider choice**: OpenAI embedding models are not enabled on the project's
  API key (only chat models), so the backfill used the existing `GEMINI_API_KEY`.
  Gemini is ~10× OpenAI's per-token price; the one-time backfill cost ~CA$30,
  and a later OpenAI `text-embedding-3-small` re-embed (~USD $3, ~$1.50 via the
  Batch API) stays cheap because the `model` column isolates versions.
- **Backfill mechanics**: per-language batches (100 inputs per
  `batchEmbedContents` call), idempotent upserts, `--skip-done` resume, a fresh
  Postgres connection per language, and a quota-aware abort with resume. Loader:
  `tmp/supabase-test/supabase-embed-metadata.py`.

## Consequences

### Positive

- **One global video table** with unique, stable IDs; no shard routing in
  queries and no per-language suffix lookup (`get_youtube_videos_suffix`).
- **Foundation for pgvector**: embeddings for recommendation/search can be added
  as a column or side table on the consolidated dataset.
- **CMS-independent data store**: the Flask backend can read video content
  directly from Postgres, easing the eventual Directus 11 / alternative-backend
  migration.
- **Cache-compatible IDs**: the tokenization/lemmatization cache rebinds to the
  new IDs via the documented deterministic transform.
- **Self-describing language codes**: `l2` values like `'zh'` match the
  client-facing `[l1]/[l2]` route params, and queries no longer need a
  `lang_id_by_code()` translation step.
- **Storage reduction**: dropping `subs_l1` roughly halves the video data; the
  consolidated table is ~6.6 GB, comfortably inside the 50 GB disk.
- **Full embedding coverage**: every video in every language has a content
  vector, so the vector recommender can serve any `(l2, level)` combination —
  the ja test recommender implements difficulty-band widening and pool-size
  tiering for thin bands and tiny languages.

### Negative / trade-offs

- **Cutover is still pending.** The Flask backend continues to read videos from
  Directus; Supabase is currently a parallel store until the backend data layer
  is switched.
- **User-data remap required** before watch history, likes, playlists, and
  `user_data` can follow: each row's video reference must be mapped
  `l2 → source shard → prefixed ID`.
- **Two-language-ID systems until cutover**: MySQL/Directus still stores
  internal IDs while Supabase stores codes; backend code must translate until
  the data layer switches over. Some languages have no ISO 639-1 code and map
  to three-letter ISO 639-3 codes (e.g., `'nan'` for Min Nan, `'ase'` for
  American Sign Language), so callers must not assume two-letter codes.
- **Subtitle FULLTEXT search is not replicated.** `/subs-search` behavior needs
  a replacement (pg_trgm or embedding-based) before Directus can be retired.
- **Provider/cost**: the embedding backfill ran on Gemini (~CA$30 one-time,
  ~10× OpenAI per token) because embedding models aren't enabled on the OpenAI
  project key; switching later costs ~USD $3 to re-embed.
- **Storage**: embeddings + HNSW index add ~13 GB; slicing to 512 dims can
  halve that if disk pressure appears.
- **IDs are large (~10^10-scale).** Code paths that assume small integer IDs or
  use 32-bit `INT` types must move to `BIGINT`.
- The migration transferred ~18 GB over the internet; large re-runs are slow but
  safe (idempotent, per-table).

## Alternatives considered

- **Keep 14 sharded tables in Supabase**: preserves old IDs but keeps shard
  routing and blocks cross-shard vector search. Rejected.
- **Literal ID prefixing** (string concatenation): simpler to state, but
  collides across shards. Rejected in favor of fixed-width blocks.
- **pgloader (MySQL → Postgres)**: purpose-built and faster, but unavailable in
  the working environment; the `python3.10` streaming bridge reuses existing
  credentials/dependencies and provides per-table verification and chunking.
  Rejected for this run.
- **Directus API / row-by-row inserts**: far too slow at this data volume.
  Rejected.

## References

- `docs/specs/004-phase3-explore-video.md` — shard layout and schema
- `docs/arch/003-python-backend-architecture.md` — Flask backend architecture
- `docs/arch/004-subs-search-architecture.md` — MySQL FULLTEXT subtitle search
- `docs/arch/017-tokenization-batch-lookup-pipeline.md` — tokenization cache
- `zerotohero-python-server/utils_directus.py` — shard suffix map
- `tmp/supabase-test/supabase-migrate.py` — migration loader
