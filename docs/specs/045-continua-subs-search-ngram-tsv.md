# SPEC-045 — Continua Subs-Search N-Gram Token Index (Supabase)

## Metadata

- **Spec ID**: SPEC-045
- **Feature**: Fast monogram/bigram subs-search for continua languages on
  Supabase (`GET /subs-search` → `utils_content.subs_search`)
- **Status**: planned (decision made 2026-08-05; implementation not started)
- **Created**: 2026-08-05
- **ROADMAP Phase**: Phase 9: Backend Consolidation (backend performance on
  `zerotohero-python-server`)
- **See also**: [ADR-0026 (Continua Subs-Search Indexing — accepted)](../adr/0026-continua-subs-search-indexing.md),
  [SPEC-044 (Subs-Search DB Optimizations)](044-subs-search-db-optimizations.md),
  [SPEC-039 (Full Migration)](039-full-database-migration-supabase.md),
  [ARCH-004 (Subs-Search Architecture — outdated)](../arch/004-subs-search-architecture.md)

## Overview

SPEC-044 made word-based subs-search fast with Postgres FTS, but continua
languages (zh/ja/th/km/…) still use `ILIKE '%term%'` + pg_trgm, which cannot
index 1–2 character patterns effectively. Dictionary lookups for these
languages are mostly **monograms and bigrams**, so the common case is slow:
`中国` ~31 s, `日本` ~8.1 s, rare 1–2 char terms >30 s, with production
`pg_stat_statements` showing ILIKE queries at 20–146 s.

ADR-0026 evaluated five options and selected **Option B: a stored tsvector of
unique 1-char and 2-char tokens per continua-language video, with a partial
GIN index**, routed through the same two-phase FTS flow as SPEC-044. This spec
outlines the implementation.

Goal: uncached p95 < 1 s for the continua benchmark matrix (common and rare,
1–4 char terms), with result parity for plain terms (no wildcards/spaces).

## Background — measured before (the problem)

| Search | Chosen plan | Measured (phase 1) | Forced `(l2, views)` walk |
|---|---|---|---|
| zh `中` (1 char, common) | walk | ~25 ms | — |
| zh `中国` (2 chars, common) | `l2` index scan + sort | ~31 s | **0.7 s** |
| zh `峥嵘` (2 chars, rare) | `l2` index scan | >30 s (timeout) | — |
| zh `绌` (1 char, rare) | `l2` index scan | >30 s (timeout) | — |
| zh `对不起` (3 chars, common) | trigram bitmap + sort | ~5.7 s | **0.33 s** |
| zh `相形见绌` (4 chars, rare) | trigram bitmap | ~84 ms | — |
| ja `私` (1 char, common) | `l2` index scan + sort | ~7.3 s | — |
| ja `日本` (2 chars, common) | `l2` index scan + sort | ~8.1 s | **0.48 s** |

Root causes:

1. **Planner misestimation.** For short ILIKE patterns the planner guesses
   tiny row counts (`中国` → 12, `日本` → 4) and picks the plain `l2` index +
   sort over the whole language subset. Its cost estimate for the trigram
   bitmap on a 2-char pattern is ~126M — effectively a full-index scan.
2. **No timeout/fallback on the ILIKE branch.** Unlike the FTS branch, the
   continua branch does not use `_phase1_ids`, so a bad plan runs to
   completion.

Token volume (2% system sample, unique per video): zh ≈ 444 chars + 1,433
bigrams; ja ≈ 236 + 815; th ≈ 75 + 702. Projected ~315M token/video pairs
across the 194,964 continua rows; stored tsvector + GIN estimated at
~7–10 GB.

## Strategy (decisions)

1. **New stored column, not a reuse of `subs_tsv`.** Add
   `subs_ngram_tsv tsvector` to `youtube_videos`. The existing `subs_tsv`
   column and its partial backfill belong to the word-based path; continua
   tokens use a separate column so the two never interfere.
2. **Tokens are line-only and space-aware.** For each continua video, parse
   the `subs_l2` CSV and read only the `line` column. Split into runs of
   non-space characters (`\S+`), then collect:
   - every unique single character in each run;
   - every unique adjacent 2-character sequence in each run.
   Store `to_tsvector('simple', ' '.join(sorted(tokens)))`. Punctuation is
   kept (parity with ILIKE); spaces never cross token boundaries.
3. **1–2 char terms match a single lexeme; 3+ char terms are the AND of
   overlapping bigrams.** For a query term:
   - 1 char → `中`
   - 2 chars → `中国`
   - 3 chars → `对不 不起` (implicit AND)
   - 4 chars → `相形 形见 见绌`
   Terms are OR-joined with `websearch_to_tsquery('simple', ...)`. The
   existing `_reduce_subs_to_context` recheck keeps only lines containing the
   full literal term, so extra bigram-only candidates are filtered.
4. **Partial GIN index over continua rows only.** The index covers the same
   language list that `subs_tsv_config(l2)` treats as NULL.
5. **Reuse the SPEC-044 two-phase flow.** Phase 1 runs through
   `_phase1_ids` (bounded walk, GIN fallback on timeout); phase 2 and the
   context reducer are unchanged.
6. **Fallbacks stay narrow.** Wildcards (`*`, `?`) and terms containing
   whitespace continue to use the existing ILIKE/trigram path. In v1, if any
   term in a request is "dirty", the whole request uses ILIKE (dirty terms
   are rare for dictionary lookups).
7. **Auto-detect readiness.** The routing uses the token index only when the
   column exists and `youtube_videos_subs_ngram_tsv_idx` is valid; otherwise
   it falls back to today's behavior. No hard dependency on a feature flag.

## Schema

```sql
-- Continua language list; keep in sync with public.subs_tsv_config()
-- zh, yue, cmn, nan, wuu, hak, hsn, cjy, mnp, cpx, gan, csp, czo,
-- leiz1236, hain1238, lzh, ltc, och, ja, ryu, ojp, ain, ii,
-- th, lo, km, my, bo, dz

alter table public.youtube_videos
  add column subs_ngram_tsv tsvector;

create index concurrently youtube_videos_subs_ngram_tsv_idx
  on public.youtube_videos using gin (subs_ngram_tsv)
  where l2 in ('zh','yue','cmn','nan','wuu','hak','hsn','cjy','mnp','cpx',
               'gan','csp','czo','leiz1236','hain1238','lzh','ltc','och',
               'ja','ryu','ojp','ain','ii','th','lo','km','my','bo','dz');
```

Invalidation trigger (set NULL on subtitle writes; a nightly job repopulates):

```sql
create or replace function public.invalidate_subs_ngram_tsv()
returns trigger language plpgsql as $$
begin
  if new.l2 in ('zh','yue','cmn','nan','wuu','hak','hsn','cjy','mnp','cpx',
                'gan','csp','czo','leiz1236','hain1238','lzh','ltc','och',
                'ja','ryu','ojp','ain','ii','th','lo','km','my','bo','dz') then
    new.subs_ngram_tsv := null;
  end if;
  return new;
end $$;

create trigger youtube_videos_invalidate_ngram_tsv
before insert or update of subs_l2 on public.youtube_videos
for each row execute function public.invalidate_subs_ngram_tsv();
```

## Backfill

New script `zerotohero-python-server/backfill_subs_ngram_tsv.py`:

1. Connect via `SUPABASE_DB_URL` (same as `utils_user_data.pg_connect`).
2. Select batches of continua rows where `subs_ngram_tsv is null` and
   `subs_l2 is not null`, ordered by `id`, e.g. 1,000 rows per batch.
3. For each row, parse `subs_l2` with `csv.reader`, find the `line` column,
   extract unique chars + bigrams per `\S+` run, and build the space-joined
   token string.
4. Update in place:
   `update public.youtube_videos set subs_ngram_tsv = to_tsvector('simple', %s) where id = any(%s)`.
5. Print progress (batch count, rows done, elapsed); support
   `--l2 zh` and `--limit` for dry runs.

Run the backfill **before** creating the partial GIN index (avoids index
maintenance during the bulk update), then create the index concurrently.
Schedule the same script nightly (or on a maintenance timer) to repair rows
invalidated by the trigger.

## Query flow (continua, plain terms)

```sql
-- phase 1
select id from public.youtube_videos
where l2 = %s
  and subs_ngram_tsv @@ websearch_to_tsquery('simple', %s)
order by views desc nulls last
limit %s;
```

Query-string examples (`websearch_to_tsquery` semantics — `OR` is the
disjunction operator; a bare `|` silently ANDs):

| Terms | `websearch_to_tsquery('simple', …)` input |
|---|---|
| `中` | `中` |
| `中国` | `中国` |
| `对不起` | `对不 不起` |
| `相形见绌` | `相形 形见 见绌` |
| `中` + `对不起` | `中 OR 对不 不起` |

Changes in `utils_content.subs_search`:

- When `_subs_tsv_config(conn, l2_code)` returns `None` (continua) and all
  terms are plain (no `*`/`?`, no whitespace):
  - build the token query string per the table above;
  - use the new `subs_ngram_tsv` filter instead of `_ilike_term_filters`;
  - run phase 1 through `_phase1_ids` with `gin_fallback=True`, and make
    `_fts_gin_ready` also accept `youtube_videos_subs_ngram_tsv_idx`.
- Otherwise (wildcards, whitespace, or index not ready): keep the current
  ILIKE/trigram path.
- Fix `_reduce_subs_to_context` to `re.escape` each term before joining the
  regex (`c++` currently raises `multiple repeat`).
- Keep the existing cache key/source (`pg`); old cached results remain valid
  because plain-term semantics are unchanged.

## Maintenance

- Subtitle writes: trigger sets `subs_ngram_tsv = null` for continua rows;
  the nightly backfill job repopulates them.
- If the Python server is the only writer, also update the token column
  inline at the write site so new videos are searchable immediately; the
  trigger remains the safety net for other writers.
- `views` changes do not affect tokens.
- Keep the partial-index language list and `subs_tsv_config()` in sync; add a
  comment in `subs_tsv_config` pointing at SPEC-045.

## Files to change

| File | Change |
|---|---|
| `zerotohero-python-server/utils_content.py` | continua routing, token query builder, `_fts_gin_ready`, `re.escape` fix |
| `zerotohero-python-server/backfill_subs_ngram_tsv.py` | new backfill/repair script |
| `zerotohero-python-server/profiling_subs_search.py` | CJK benchmark matrix |
| `zerotohero-python-server/test_app.py` | unit tests for token builder/query builder; keep existing endpoint test green |
| `zerotohero-python-server/tmp/` | migration SQL (column, trigger, index) |
| `docs/arch/004-subs-search-architecture.md` | update backend section after rollout |

## Verification

1. **Benchmark matrix** (extend `profiling_subs_search.py`, uncached,
   `use_cache=False`):

   | Search | Before | Target |
   |---|---|---|
   | zh `中` | ~25 ms | < 0.5 s |
   | zh `的` | ~5 ms | < 0.5 s |
   | zh `中国` | ~31 s | < 1 s |
   | zh `峥嵘` | > 30 s | < 1 s |
   | zh `绌` | > 30 s | < 1 s |
   | zh `对不起` | ~5.7 s | < 1 s |
   | zh `相形见绌` | ~84 ms | < 0.5 s |
   | ja `私` | ~7.3 s | < 1 s |
   | ja `の` | ~10 ms | < 0.5 s |
   | ja `日本` | ~8.1 s | < 1 s |

2. **Plan gates** (`EXPLAIN (ANALYZE)`):
   - common terms → Index Scan on `idx_youtube_videos_l2_views`, stops at
     LIMIT;
   - rare/zero-match terms → Bitmap Index Scan on
     `youtube_videos_subs_ngram_tsv_idx`;
   - no full `l2` index scans for plain continua terms.
3. **Result parity**: on a sample of zh/ja/th videos, compare the token
   path's top-100 id sets against the ILIKE truth for a list of plain terms;
   require identical results. Measure the empty-`subs_l2` ratio after
   `_reduce_subs_to_context` (bigram-AND candidates that don't contain the
   literal term) — expected to be small for CJK.
4. **Regression**: existing `test_app.py` subs-search endpoint test
   (`相形见绌,相形見絀&l2=zh&sort=-views`) must pass unchanged.
5. **Production monitoring**: after rollout, check `pg_stat_statements` for
   the new `subs_ngram_tsv` queries and confirm the ILIKE phase-1 latency
   disappears from the top-slow list.

## Migration steps (ordered)

1. Add `subs_ngram_tsv` column + invalidation trigger (migration SQL in
   `zerotohero-python-server/tmp/`).
2. Write `backfill_subs_ngram_tsv.py` + unit tests; dry-run on a sample.
3. Backfill all continua rows in batches; monitor progress and storage.
4. `create index concurrently youtube_videos_subs_ngram_tsv_idx`.
5. Ship routing changes (auto-detect index readiness; falls back to ILIKE
   until the index is valid).
6. Run benchmark matrix + parity checks; verify plan gates.
7. Update ARCH-004's backend section and SPEC-044's verification table.

## Known limitations / risks

- **Storage/build**: ~7–10 GB and a multi-hour backfill on the continua
  corpus; validate on a staging copy first if available.
- **Full-scale planner behavior**: the prototype was 2k rows; the walk/GIN
  split must be verified at 122k zh rows. The bounded walk + GIN fallback
  prevents hangs if the planner misbehaves.
- **3+ char terms via bigram AND** can produce candidates where the bigrams
  co-occur in different lines but the literal term never appears; the
  context recheck filters them (may add empty-`subs_l2` responses, same as
  today's behavior).
- **New videos**: between a subtitle write and the next backfill run, a row
  with `subs_ngram_tsv = null` is invisible to token searches. Inline update
  at the Python write site mitigates this for the main writer.
- **Dirty terms** (wildcards/whitespace) fall back to ILIKE for the whole
  request in v1; acceptable because they are rare and explicit.
- **Language-list drift**: the partial index list must match
  `subs_tsv_config()`; keep them adjacent and commented.

## Out of scope / future work

- Cache TTL for fresh-video visibility (SPEC-044 future work).
- Stored tsvector / dedicated search table for word-based languages
  (SPEC-044 future work).
- Posting table and PGroonga remain documented alternatives in ADR-0026 if
  full-scale validation fails.
- Per-term hybrid routing (token path for clean terms + ILIKE for dirty terms
  in the same request) if dirty-term traffic proves significant.
