# SPEC-044 — Subs-Search Database Optimizations (Supabase)

> **Merged 2026-08-05**: this spec now includes the former
> [SPEC-045](045-continua-subs-search-ngram-tsv.md) (continua n-gram token
> index) as **Part 2**. SPEC-045 is superseded; its file is a redirect stub.
> The two parts are one feature — making `GET /subs-search` fast on Supabase
> for every language.

## Metadata

- **Spec ID**: SPEC-044 (merged; supersedes SPEC-045)
- **Feature**: Subtitle search performance on Supabase (`GET /subs-search` →
  `utils_content.subs_search`)
- **Status**: **Part 1 (word-based FTS) complete** (implemented + verified
  2026-08-05); **Part 2 (continua n-gram token index) blocked at backfill**
  (code shipped, migration partially applied, storage-layer I/O hang —
  see "Blockers / rollout state").
- **Created**: 2026-08-05
- **ROADMAP Phase**: Phase 9: Backend Consolidation (backend performance on
  `zerotohero-python-server`)
- **See also**: [SPEC-038 (Video Content, complete)](038-video-content-supabase.md),
  [SPEC-039 (Full Migration, WS-5 §9)](039-full-database-migration-supabase.md),
  [ADR-0021 (Video Content → Supabase)](../adr/0021-migrate-video-content-to-supabase.md),
  [ADR-0026 (Continua Subs-Search Indexing — accepted)](../adr/0026-continua-subs-search-indexing.md),
  [ARCH-004 (Subs-Search Architecture — outdated, to be updated)](../arch/004-subs-search-architecture.md),
  [SPEC-037 (Two-Tier Cache)](037-two-tier-remote-cache-offload.md)

## Overview

The Postgres `/subs-search` path took **~42 s cold** for common English terms
(e.g. `fly,flies,flew,flown&l2=en&limit=100`). This spec documents the
strategy that replaced that path and closed the continua-language gap it
left:

- **Part 1** — word-based full-text matching over a GIN expression index, a
  two-phase query, a composite **(l2, views)** index for early-stop walks, and
  the shared result cache. All numbers verified against the live Supabase DB
  on 2026-08-05: `fly` ~0.6 s, `marry` ~1.3 s, `zygote` ~1 s, cached ~0.01 s.
- **Part 2** — a stored n-gram token tsvector (`subs_ngram_tsv`, unique
  1-char + 2-char tokens per video) with a partial GIN index for continua
  languages (zh/ja/th/km/…), routed through the same two-phase FTS flow. The
  goal is uncached p95 < 1 s for the continua benchmark matrix (1–4 char
  terms). **Blocked at the backfill by a storage-layer I/O hang** (see
  Blockers below).

---

# Part 1 — Word-based full-text search

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
   ILIKE/trigram (Part 2 adds the n-gram token path). Vietnamese keeps the
   trigram ILIKE retry for its word-based walk. Every other language is
   word-based FTS only.
8. **Caching.** Results are cached in the shared subs-search cache, keyed with
   a `pg` namespace so they never collide with the Classic MySQL cache keys.

## Schema

```sql
-- Per-language text-search config (single source of truth; NULL = no word
-- boundaries → app uses ILIKE/trigram, or the Part 2 n-gram path)
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
| Continua scripts (zh/ja/th/km/lo/my/bo/dz, Sinitic variants, …) | **Part 2 n-gram token path** (`subs_ngram_tsv @@ websearch_to_tsquery('simple', …)`) once `youtube_videos_subs_ngram_tsv_idx` is valid; until then ILIKE + trigram | ILIKE/trigram for wildcards, whitespace, or pre-migration |
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

> **Correction (2026-08-05):** the Chinese "~0.4 s" row above is only valid
> for **3+ char terms** (pg_trgm has a usable trigram for those). Common 1-2
> char terms (`中国` ~31 s) and rare 1-2 char terms (`峥嵘`, `绌` >30 s) stayed
> slow because pg_trgm cannot index short patterns and the planner misestimates
> their selectivity. That gap is what **Part 2** addresses; see the next
> section.

---

# Part 2 — Continua n-gram token index

## Background — measured before (the problem)

Continua languages still use `ILIKE '%term%'` + pg_trgm, which cannot index
1–2 character patterns effectively. Dictionary lookups for these languages
are mostly **monograms and bigrams**, so the common case is slow: `中国` ~31 s,
`日本` ~8.1 s, rare 1–2 char terms >30 s, with production `pg_stat_statements`
showing ILIKE queries at 20–146 s.

ADR-0026 evaluated five options and selected **Option B: a stored tsvector of
unique 1-char and 2-char tokens per continua-language video, with a partial
GIN index**, routed through the same two-phase FTS flow as Part 1.

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
~7–10 GB. Both figures come from
[ADR-0026](../adr/0026-continua-subs-search-indexing.md) (2,000-row prototype,
~85 MB, scaled linearly to the full continua corpus) — validate on a staging
copy and monitor actual storage during the backfill.

## Strategy (decisions)

> This strategy is the implementation of the **accepted decision in
> [ADR-0026](../adr/0026-continua-subs-search-indexing.md)** (Option B — stored
> n-gram tsvector), which contains the option comparison, rationale, and the
> prototype measurements. The decisions below are the as-built detail.

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
5. **Reuse the Part 1 two-phase flow.** Phase 1 runs through `_phase1_ids`
   (bounded walk, GIN fallback on timeout); phase 2 and the context reducer
   are unchanged.
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

The script is keyset-paginated on `id`, has a per-batch timeout (60 s) with a
per-row fallback (30 s) that skips+logs pathological rows to a slow-rows log,
and a burst/pause option (`--burst 5 --pause 30`) to pace writes. **Note
(2026-08-05): tuning these knobs does not fix the current blocker** — the
hang is not sustained-load throttling; see "Blockers / rollout state".

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
  comment in `subs_tsv_config` pointing at Part 2 of this spec.

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

---

# Blockers / rollout state (2026-08-05)

## Original hypothesis (superseded by the deep-dive below)

The first diagnosis (morning of 2026-08-05) blamed **collapsing write
throughput under sustained multi-KB TOAST writes**: single-row writes were
~276 ms idle but 10–30 s/row under sustained backfill load; no autovacuum/bloat
(~22k dead tuples vs the ~209k autovacuum threshold); best-fit explanation was
instance-level IOPS throttling plus self-inflicted WAL/checkpoint/TOAST churn
on the ~14 GB table. **That hypothesis is now disproven** — a controlled idle
test shows even a single row hangs; see below.

## Root-cause diagnosis (evening of 2026-08-05)

**Blocker: the backfill does not converge because single-row UPDATEs on
`youtube_videos` hang at the storage layer.** This was established with
minimal-load diagnostics (read-only queries + a few bounded single-row writes;
the DB is back to idle):

1. **Controlled idle burst tests** (the diagnostic the original blocker
   section called for): a 1-row write is **86–276 ms** (fast), but a 5-row
   batch of normal ~6 KB rows **times out at 60–120 s**, deterministically, on
   an otherwise idle instance. Across a 40-row sample spread over the whole
   table, **~80 % of single-row UPDATEs fail a 5 s timeout** (deterministic on
   retry).
2. **The stall signature.** The stuck backend sits in
   `wait_event = 'IO/DataFileRead'` for 5–70+ s while a Supabase Prometheus
   scrape shows **both volumes completely idle** — 0 bytes transferred, 0 I/O
   in flight, no checkpoint, during the entire hang. The I/O request never
   reaches the device; it is stuck in a layer above the disk
   (block/filesystem), or the wait masks an internal stall.
3. **Ruled out** (each verified live): locks (25 normal locks, no waiters),
   checkpoints (`pg_stat_checkpointer` delta 0 during stalls), autovacuum
   (below threshold — not bloat), replication (no slots), the query plan
   (optimal nested-loop pkey probe), `to_tsvector('simple', …)` cost
   (~68 ms), TOAST size (a row fails even writing `NULL` or tiny tokens, and
   is alone on its heap page), the pooler (the wait event is reported by the
   PostgreSQL backend itself, so it is server-side), concurrent production
   traffic (all sessions idle), and the filesystem (not read-only, no device
   errors).
4. **Reads and small-table writes work.** Full-row SELECTs (incl. cold
   TOAST) complete in 60–110 ms; writes to `user_progress`, `sessions`, etc.
   work; the app is healthy. The hang is specific to UPDATEs of the big
   `youtube_videos` heap.
5. **Server-side latency is real.** `pg_stat_statements` shows the backfill's
   own batch UPDATEs at **27–270 s** server-side (not client/pooler/script
   overhead).
6. **The instance is the smallest compute tier**: 1 vCPU, 2 GB RAM,
   `shared_buffers` 512 MB on a 14 GB table (6 GB TOAST, `subs_l2` avg 11 KB).
   The 7.3 h backfill window produced **21 GB WAL, 4.5M full-page images, 92
   checkpoints** (`checkpoint_timeout=300s` + `full_page_writes=on`), **~130 GB
   written / ~236 GB read** on the data volume, and a bgwriter permanently at
   max (`maxwritten_clean` 28k).
7. **Conclusion.** This is **not** sustained-load IOPS throttling and is
   **not fixable by `--burst/--pause` tuning** — even a single idle row hangs
   with no disk activity. The signature points to a **storage-layer I/O hang
   on the data volume** (degraded/throttled EBS on an undersized instance).
   Next steps: contact **Supabase support** with this evidence (single-row
   UPDATE hangs in `DataFileRead` with zero disk I/O; ~80 % of rows; small-
   table writes fine), and **upgrade the compute tier** (more RAM →
   `shared_buffers`, better storage). Until then the backfill stays parked.
8. **State**: 12,166 backfilled / **182,507 remaining** (continua-only;
   idempotent/resumable). The routing auto-detects index readiness and falls
   back to ILIKE, so there is **no production impact**.

**Diagnostic scripts** (kept in `zerotohero-python-server/tmp/`):
`diag_backfill_slow.py` (read-only state/stats dump), `burst_test.py`,
`wait_event_test.py`, `io_attribution.py`, `os_disk_during_stall.py`,
`idle_io_60s.py`. Useful for re-verification or as evidence for Supabase.

## Alternatives that bypass the backfill — status (2026-08-06)

Two paths do **not** require the in-place backfill that hangs. Both were
attempted on 2026-08-06:

- **Option A — planner safety net: SHIPPED and live.** `utils_content.subs_search`
  now runs the continua ILIKE phase 1 through a bounded 3-attempt sequence
  (planner's choice → forced `(l2, views)` walk via `enable_sort=off` → pg_trgm
  bitmap via `enable_indexscan=off`), each 6 s, worst case ~18 s, and timeouts
  are never cached. Committed in the server repo (`ae523a2`). Live
  measurements (zh/ja, 2026-08-06): `中` 0.67 s, `相形见绌` 1.48 s, `中国`
  31 s → 8.45 s, `日本` 8.1 s → 6.85 s, rare `峥嵘` >30 s hang → 18.85 s
  bounded (0 results, not cached). This bounds everything and makes common
  1-char / 4-char terms fast, but it does not reach the <1 s target for
  2-char common terms — that still needs a real index.
- **PGroonga: attempted, BLOCKED by the same storage hang.** The extension
  was enabled (`pgroonga` 3.2.5, `extensions` schema) and a temp-table
  validation passed: a TokenBigram index over a 500-row sample built in 2.2 s
  and `&@` / `&@|` / `&@~` returned **exact parity with ILIKE** for
  `中`/`中国`/`对不起`/`相形见绌`/`日本`/`私`/`の` (1-char terms work via
  match escalation). The full partial index build over the live continua rows
  then **hung** in PGroonga's "indexing (loading)" phase: the build backend
  ran 7+ minutes with **zero CPU, zero WAL, zero disk I/O** and was
  **unkillable even via `pg_terminate_backend`** (uninterruptible kernel
  D-state — PGroonga does its own file I/O outside PG's wait-event machinery,
  so the hang shows as `wait_event=None` instead of `DataFileRead`). It holds
  `ShareUpdateExclusiveLock` on `youtube_videos` (blocks DDL, not reads/writes
  — the app is unaffected). This is the **same storage-layer root cause** as
  the backfill and disproves the hope that "index builds avoid the hang". The
  routing code (`subs_l2 &@| …`, auto-detected) is committed but **dormant**
  (gated on index validity) and will activate automatically if a later build
  succeeds.
- **Cleanup done (2026-08-06)**: after a Supabase restart cleared the stuck
  backend, `youtube_videos_subs_l2_pgroonga_idx` was dropped (the cancelled
  CONCURRENTLY build had left it invalid). The `pgroonga` extension remains
  installed (harmless) for a retry after the compute upgrade.
- **Conclusion**: neither bypass is usable until the storage-layer issue is
  fixed (compute upgrade / Supabase support). Option A is a strict
  improvement and is live in the meantime. See the blocker diagnosis above.

## Migration steps (ordered)

1. ✅ Add `subs_ngram_tsv` column + invalidation trigger (done).
2. ✅ Write `backfill_subs_ngram_tsv.py` + unit tests (done; script has burst/
   pause + timeout safety net).
3. ⛔ Backfill all continua rows in batches — **blocked** (storage-layer I/O
   hang; see above). Resumed at **12,166 / 182,507** once the storage issue is
   resolved. **2026-08-06**: Option A planner safety net shipped (live); the
   PGroonga index build was attempted and hung on the same storage issue
   (see "Alternatives that bypass the backfill" below) — an invalid
   `youtube_videos_subs_l2_pgroonga_idx` remains to be dropped after the
   instance recovers.
4. ⬜ `create index concurrently youtube_videos_subs_ngram_tsv_idx`.
5. ✅ Ship routing changes (auto-detect index readiness; falls back to ILIKE
   until the index is valid) — code done, dormant until the index exists.
6. ⬜ Run benchmark matrix + parity checks; verify plan gates.
7. ✅ Update ARCH-004's backend section and this spec's verification table
   (done).

---

# Known limitations / risks

- **Part 1 matching is word-based**: `fly` matches the word/stem, not
  substrings like `butterfly`. Inflections are passed explicitly by the
  client, so coverage is preserved.
- **Rare-term safety net**: if the walk times out and the GIN retry can't
  run, the search returns no results (bounded at ~6 s) rather than scanning
  the corpus.
- **Cache has no TTL** (parity with the Classic path): previously cached
  searches won't pick up newly added videos until the cache is cleared.
- **Wildcard `?` searches** on medium-frequency patterns remain slow
  (pre-existing ILIKE behavior).
- **Part 2 storage/build**: ~7–10 GB and a multi-hour backfill on the
  continua corpus — and currently the backfill itself hangs at the storage
  layer (see Blockers).
- **Part 2 full-scale planner behavior**: the prototype was 2k rows; the
  walk/GIN split must be verified at 122k zh rows. The bounded walk + GIN
  fallback prevents hangs if the planner misbehaves.
- **Part 2 3+ char terms via bigram AND** can produce candidates where the
  bigrams co-occur in different lines but the literal term never appears; the
  context recheck filters them (may add empty-`subs_l2` responses, same as
  today's behavior).
- **Part 2 new videos**: between a subtitle write and the next backfill run,
  a row with `subs_ngram_tsv = null` is invisible to token searches. Inline
  update at the Python write site mitigates this for the main writer.
- **Part 2 dirty terms** (wildcards/whitespace) fall back to ILIKE for the
  whole request in v1; acceptable because they are rare and explicit.
- **Language-list drift**: the partial index list must match
  `subs_tsv_config()`; keep them adjacent and commented.
- **Leftover empty `subs_tsv` column** from the aborted ALTER attempt remains
  on `youtube_videos` (all NULL); dropping it rewrites the table, so it's
  deferred to a maintenance window (noted in the migration file).
- **ARCH-004 is outdated** (describes MySQL ngram) — to be updated to match
  this strategy.

# Out of scope / future work

- **Cache TTL** if fresh-video visibility in search matters.
- **Stored tsvector / dedicated search table for word-based languages**
  (bulk `CREATE TABLE AS`, ~30–60 min) to cut medium-term recheck cost
  further.
- **Materialized inverted index** (`(lexeme, video_id, views)`, index-only
  lookups) for guaranteed sub-second behavior on every term, at the cost of
  ~10–15 GB and a sync trigger.
- **PGroonga as the continua unblock** — viable only **after** the storage
  issue is fixed: the 2026-08-06 partial-index build hung on the same
  storage-layer hang (see "Alternatives that bypass the backfill" for the
  full outcome). The routing code is already committed and dormant, so a
  successful build after the compute upgrade activates it automatically.
- **Posting table** remains the documented heavy alternative in ADR-0026.
- **Per-term hybrid routing** (token path for clean terms + ILIKE for dirty
  terms in the same request) if dirty-term traffic proves significant.
