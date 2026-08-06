# SPEC-044 — Subs-Search Database Optimizations (Supabase)

## Metadata

- **Spec ID**: SPEC-044
- **Feature**: Subtitle search performance on Supabase (`GET /subs-search` → `utils_content.subs_search`)
- **Status**: complete (implemented and verified 2026-08-05)
- **Created**: 2026-08-05
- **ROADMAP Phase**: Phase 9: Backend Consolidation (backend performance on `zerotohero-python-server`)
- **See also**: [SPEC-038 (Video Content, complete)](038-video-content-supabase.md), [SPEC-039 (Full Migration, WS-5 §9)](039-full-database-migration-supabase.md), [ADR-0021 (Video Content → Supabase)](../adr/0021-migrate-video-content-to-supabase.md), [ARCH-004 (Subs-Search Architecture — outdated, to be updated)](../arch/004-subs-search-architecture.md), [SPEC-037 (Two-Tier Cache)](037-two-tier-remote-cache-offload.md)

## Overview

The Postgres `/subs-search` path took **~42 s cold** for common English terms
(e.g. `fly,flies,flew,flown&l2=en&limit=100`). This spec documents the current
strategy that replaced that path: **word-based full-text matching** over a GIN
expression index, a **two-phase query**, a composite **(l2, views)** index for
early-stop walks, and the **shared result cache**. All numbers below were
verified against the live Supabase database on 2026-08-05.

Measured result: common terms `fly` ~0.6 s and `marry` ~1.3 s cold, rare terms
`zygote` ~1 s, zero-match ~0.2 s, Chinese/Vietnamese ~0.4 s, and cached
searches ~0.01 s.

## Background — measured before (the problem)

The previous path was a single query:

```sql
SELECT ... FROM public.youtube_videos
WHERE l2 = 'en' AND (subs_l2 ILIKE '%fly%' OR subs_l2 ILIKE '%flies%' ...)
ORDER BY views DESC NULLS LAST LIMIT 100;
```

| Factor | Measured |
|---|---|
| Table | 1,045,422 rows, ~10 GB (`subs_l2` is a TOASTed CSV, 3–146 KB/row) |
| English corpus | 155,004 rows |
| Matches for `fly` forms | 17,603 rows (~11.4 % of EN) |
| Trigram bitmap candidates | ~41,130 rows; 23,527 false positives removed by recheck |
| Buffers read | ~622k pages ≈ **4.8 GB of TOAST reads** (recheck detoasts every candidate's `subs_l2`) |
| Sort | all 17,603 matches materialized (with full `subs_l2`) to pick top-100 by views |
| End-to-end | **~42 s** (single request; two concurrent requests → ~64 s) |

The Python context reduction (`_reduce_subs_to_context`) was negligible
(~0.15 s) — the cost was entirely the SQL.

## Strategy (decisions)

1. **Word-based matching via Postgres full-text search.** For languages with a
   text-search config, match with
   `to_tsvector(public.subs_tsv_config(l2), subs_l2) @@ websearch_to_tsquery(config, 'a OR b')`
   instead of `ILIKE '%term%'`. Note: `websearch_to_tsquery` uses the word
   `OR` as the disjunction operator — a bare `|` is a separator and silently
   ANDs terms.
2. **Two-phase query.** Phase 1 selects matching ids ordered by views
   (`LIMIT 100`); phase 2 fetches full rows only for those ids. The multi-KB
   `subs_l2` blobs are never fetched for non-top-100 matches.
3. **Composite (l2, views DESC NULLS LAST) index.** Lets the phase-1 sort walk
   the index in views order and stop after `limit` matches instead of sorting
   every match.
4. **GIN expression index over `to_tsvector(...)`.** Exact lexeme lookups for
   rare/zero-match terms (no false positives, so only true matches are
   rechecked). Build is long (~96 min, concurrent, non-blocking) but one-time.
5. **Planner-driven strategy split.** After `ANALYZE`, common terms use the
   `(l2, views)` walk and rare/zero-match terms use the GIN bitmap directly.
   A 6 s walk-timeout → GIN-bitmap retry remains as a safety net.
6. **No full-corpus scan.** If the walk times out and the GIN retry is
   unavailable (or also bounded), return no results; timeouts are **not**
   cached as "no matches".
7. **Language routing.** Continua-script languages (Sinitic, Japanese, Thai,
   Khmer, Lao, Burmese, Tibetan, …) have no word boundaries → keep
   ILIKE/trigram. Vietnamese keeps the trigram ILIKE retry for its word-based
   walk. Every other language is word-based FTS only.
8. **Caching.** Results are cached in the shared subs-search cache, keyed with
   a `pg` namespace so they never collide with the Classic MySQL cache keys.

## Schema

```sql
-- Per-language text-search config (single source of truth; NULL = no word
-- boundaries → app uses ILIKE/trigram)
create or replace function public.subs_tsv_config(l2 text)
returns regconfig language sql immutable as $$
  select case
    when l2 in ('zh','yue','cmn','nan','wuu','hak','hsn','cjy','mnp','cpx',
                'gan','csp','czo','leiz1236','hain1238','lzh','ltc','och',
                'ja','ryu','ojp','ain','ii',
                'th','lo','km','my','bo','dz') then null::regconfig
    when l2 = 'en' then 'english'::regconfig
    ... (fr, de, es, it, pt, nl, ru, sv, no, da, fi, hu, ro, tr, el, ca,
         eu, hi, id, ga, lt, ne, ta, hy, ar, sr, yi)
    else 'simple'::regconfig
  end;
$$;

-- Early-stop walk for ORDER BY views LIMIT
create index concurrently idx_youtube_videos_l2_views
  on public.youtube_videos (l2, views desc nulls last);

-- Exact lexeme lookups (rare/zero-match terms)
create index concurrently youtube_videos_subs_tsv_idx
  on public.youtube_videos using gin (
    to_tsvector(public.subs_tsv_config(l2), subs_l2)
  );

-- Pre-existing: trigram index for the ILIKE paths
-- youtube_videos_subs_l2_trgm_idx  gin (subs_l2 gin_trgm_ops)
```

Full migration (applied): `zerotohero-python-server/tmp/supabase-subs-search-fts.sql`.

## Query flow

Phase 1 (word-based languages):

```sql
SELECT id FROM public.youtube_videos
WHERE l2 = 'en'
  AND to_tsvector(public.subs_tsv_config(l2), subs_l2)
      @@ websearch_to_tsquery(public.subs_tsv_config('en'), 'fly OR flies OR flew OR flown')
ORDER BY views DESC NULLS LAST
LIMIT 100;
```

Phase 2 (only for the limited id set, order preserved in Python):

```sql
SELECT id, youtube_id, title, ..., subs_l2, ...
FROM public.youtube_videos WHERE id = ANY(%s);
```

Planner behavior after `ANALYZE` (verified with EXPLAIN):

| Term frequency | Plan | Example cost |
|---|---|---|
| Common (matches ≥ ~1 % of corpus) | `(l2, views)` index walk, filter `@@` per row, stops at `LIMIT` | `fly` ~0.6 s, `marry` ~1.3 s |
| Rare / zero-match | GIN bitmap (`BitmapAnd` of `subs_tsv_idx` + `l2`) + sort | `zygote` ~1 s, `zzzzqqq` ~0.2 s |
| Walk timeout (safety net) | retry with index scans disabled → GIN bitmap; else no results | ~6 s worst case |

## Language routing matrix

| Language group | Matching engine | Fallback |
|---|---|---|
| Word-based (en, fr, de, ru, es, it, …) | FTS (`@@ websearch_to_tsquery`) | GIN bitmap on walk timeout (no trigram, no full scan) |
| Vietnamese (`vi`) | FTS (`simple` config) | pg_trgm ILIKE bitmap on walk timeout |
| Continua scripts (zh/ja/th/km/lo/my/bo/dz, Sinitic variants, …) | ILIKE + trigram (config = NULL) | — (trigram is the primary path) |
| Wildcards (`*`, `?`) — any language | ILIKE | — (explicit user intent) |

## Verification (measured after, 2026-08-05)

| Search | Before | After |
|---|---|---|
| `fly,flies,flew,flown` en (common) | ~42 s | **~0.6 s** |
| `marry` en (medium) | slow | **~1.3 s** |
| `zygote` en (rare) | empty at 6 s / minutes | **~1 s, 20 results** |
| `zzzzqqq` en (zero-match) | ~6 s empty | **~0.2 s empty** |
| `相形见绌,相形見絀` zh (4-char, rare) | ~40 s | **~0.4 s** |
| `xin` vi | — | **~0.4 s** |
| Any repeated search | n/a | **~0.01 s (cached)** |

> **SPEC-045 correction (2026-08-05):** the Chinese "~0.4 s" row above is only
> valid for **3+ char terms** (pg_trgm has a usable trigram for those). Common
> 1-2 char terms (`中国` ~31 s) and rare 1-2 char terms (`峥嵘`, `绌` >30 s)
> stayed slow because pg_trgm cannot index short patterns and the planner
> misestimates their selectivity. SPEC-045 adds a stored n-gram token tsvector
> (`subs_ngram_tsv`) with a partial GIN index for continua languages; see
> [SPEC-045](045-continua-subs-search-ngram-tsv.md).

## Known limitations

- **Matching is word-based** for FTS languages: `fly` matches the word/stem,
  not substrings like `butterfly`. Inflections are passed explicitly by the
  client (`fly,flies,flew,flown`), so coverage is preserved.
- **Rare-term safety net:** if the walk times out and the GIN retry can't
  run, the search returns no results (bounded at ~6 s) rather than scanning
  the corpus.
- **Cache has no TTL** (parity with the Classic path): previously cached
  searches won't pick up newly added videos until the cache is cleared.
- **Wildcard `?` searches** on medium-frequency patterns remain slow
  (pre-existing ILIKE behavior).
- **Leftover empty `subs_tsv` column** from the aborted ALTER attempt remains
  on `youtube_videos` (all NULL); dropping it rewrites the table, so it's
  deferred to a maintenance window (noted in the migration file).
- **ARCH-004 is outdated** (describes MySQL ngram) — to be updated to match
  this strategy.

## Future work

- **Stored tsvector / dedicated English search table** (bulk `CREATE TABLE
  AS`, ~30–60 min) to cut medium-term recheck cost further.
- **Materialized inverted index** (`(lexeme, video_id, views)`, index-only
  lookups) for guaranteed sub-second behavior on every term, at the cost of
  ~10–15 GB and a sync trigger.
- **Cache TTL** if fresh-video visibility in search matters.
