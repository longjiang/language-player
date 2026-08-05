# ADR-0026: Subs-Search Indexing for Continua Languages (Monograms & Bigrams)

**Date**: 2026-08-05
**Status**: accepted
**See also**: [SPEC-044](../specs/044-subs-search-db-optimizations.md),
[ARCH-004](../arch/004-subs-search-architecture.md),
[SPEC-039](../specs/039-full-database-migration-supabase.md),
[ADR-0021](0021-migrate-video-content-to-supabase.md)

## Context

`GET /subs-search` finds videos whose `subs_l2` contains any of the client's
inflected forms. SPEC-044 replaced the original ~42 s single-query ILIKE path
with word-based Postgres FTS for languages that have word boundaries, a
two-phase query, an `(l2, views DESC NULLS LAST)` early-stop index, and a
shared result cache.

Continua-script languages (Sinitic, Japanese, Thai, Khmer, Lao, Burmese,
Tibetan, …) have no reliable word boundaries, so SPEC-044 routes them to
`ILIKE '%term%'` + the existing pg_trgm GIN index. That routing has a critical
gap: **1- and 2-character terms — the common case for Chinese/Japanese/Thai
dictionary lookups — are barely indexable by trigrams.** pg_trgm extracts
character trigrams, so a 2-character pattern has only one real content
trigram and a 1-character pattern has none.

For readers unfamiliar with the table columns below: Postgres's **query
planner** decides how to run each SQL statement — which indexes to use,
whether to sort, how to combine filters — by estimating how many rows will
match and what each strategy costs. When those estimates are wrong, it can
pick a plan that scans far more data than necessary.

The app's search runs in two phases: **phase 1** is a lightweight query that
returns only the matching video ids, ordered by views and limited to 100;
**phase 2** fetches the full rows (including the multi-KB subtitle blobs)
for just those ids. All measurements below are phase-1 queries.

**Forced `(l2, views)` walk** is a diagnostic: we ran the same phase-1 query
with Postgres's sort step disabled (`enable_sort = off`), which forces the
planner to walk the `(l2, views DESC NULLS LAST)` index in views order and
stop after 100 matches. It shows what the query costs when the planner makes
the "early-stop walk" choice — the fast path SPEC-044 was designed around —
instead of scanning and sorting the whole language subset.

Verified against the live Supabase database on 2026-08-05
(`public.youtube_videos`, 1,045,422 rows, ~13 GB total, `subs_l2` TOASTed at
3–116 KB/row):

| Search | Chosen plan | Measured (phase 1) | Forced `(l2, views)` walk | Notes |
|---|---|---|---|---|
| zh `中` (1 char, common) | walk | ~25 ms | — | fine |
| zh `的` (1 char, very common) | walk | ~5 ms | — | fine |
| zh `中国` (2 chars, common) | `l2` index scan + sort | ~31 s | **0.7 s** | planner est. 12 rows; actual 12,538 |
| zh `峥嵘` (2 chars, rare) | `l2` index scan | >30 s (timeout) | — | 28 actual matches |
| zh `绌` (1 char, rare) | `l2` index scan | >30 s (timeout) | — | |
| zh `对不起` (3 chars, common) | trigram bitmap + sort | ~5.7 s | **0.33 s** | 3,190 actual matches |
| zh `相形见绌` (4 chars, rare) | trigram bitmap | ~84 ms | — | SPEC-044's benchmark |
| ja `私` (1 char, common) | `l2` index scan + sort | ~7.3 s | — | planner est. 4 rows; actual 11,551 |
| ja `の` (1 char, very common) | walk | ~10 ms | — | fine |
| ja `日本` (2 chars, common) | `l2` index scan + sort | ~8.1 s | **0.48 s** | planner est. 4 rows; actual 7,591 |

Two mechanisms combine to cause this:

1. **Planner misestimation.** For short ILIKE patterns the planner guesses
   tiny row counts (`中国` → 12, `日本` → 4), so it prefers
   `idx_youtube_videos_l2` + sort over the whole language subset instead of
   the `(l2, views)` walk. Its cost estimate for the trigram bitmap on a
   2-char pattern is ~126 million — effectively a full-index scan — so the
   trigram index is never chosen for the terms that need it most.
2. **No timeout/fallback on the ILIKE branch.** In `utils_content.subs_search`
   the FTS branch runs through `_phase1_ids` (6 s walk timeout, GIN retry),
   but the continua/ILIKE branch calls `_query_all` directly: no timeout, no
   retry, no "don't cache timeouts" guard.

`pg_stat_statements` shows the production impact: the current phase-1 ILIKE id
query has 25 calls with mean 33.3 s / max 146.4 s; the pre-split full-row
ILIKE query has 398 calls with mean 23.9 s / max 119.8 s (cumulative stats
that include pre-SPEC-044 traffic).

ARCH-004's other main concern — MySQL ngram FULLTEXT false positives from
matching translation text and CSV metadata — is mostly obsolete on Supabase:
sampled zh/ja/th `subs_l2` CSVs contain only `starttime[,duration],line`, so
whole-blob ILIKE matches line text almost exactly. The remaining problem is
the monogram/bigram index gap.

Token volume for the continua corpus (2% system sample, unique per video):

| l2 | Rows | Avg unique chars/video | Avg unique bigrams/video |
|---|---:|---:|---:|
| zh | 121,834 | 444 | 1,433 |
| ja | 37,248 | 236 | 815 |
| th | 15,549 | 75 | 702 |
| all continua languages | 194,964 | — | — |

Total projected char+bigram postings: ~280M for zh/ja/th alone, ~315M
including the smaller Sinitic groups (`nan`, `yue`, `cmn`, …).

## Options considered

### Option A — Status quo + planner safety net (no new index)

Keep ILIKE/pg_trgm as the primary continua path, but add what SPEC-044 already
does for FTS: a bounded walk (short `statement_timeout`), a forced
`enable_sort = off` retry to use the `(l2, views)` walk, and a trigram/ILIKE
retry for rare terms. Never cache timeouts.

**Initial cost**

- Low: no backfill, no new index, no storage. Changes are confined to
  `utils_content.subs_search` and the phase-1 helper.

**Result quality**

- Unchanged: exact substring semantics are preserved.
- No new false positives/negatives.

**Performance**

- Pros: forces the fast walk for common terms (measured 31 s → 0.7 s for
  `中国`, 8.1 s → 0.48 s for `日本`).
- Cons: rare 1–2 char terms still have no fast path. The forced walk scans
  the whole language subset when matches are rare (`峥嵘`, `绌` > 30 s), and
  the trigram retry is effectively a full-index scan for short patterns
  (~126M planner cost). 3+ char common terms improve only via the forced walk.

### Option B — Stored n-gram token tsvector (recommended candidate)

Backfill a stored tsvector (the `subs_tsv` column already exists and is
partially backfilled) with unique 1-char and 2-char tokens extracted from the
`line` column of each continua-language video. Add a partial GIN index and
route 1–2 char terms through the existing FTS machinery:

```sql
-- backfill (Python parses the CSV and emits space-joined unique tokens)
update public.youtube_videos v
set subs_tsv = to_tsvector('simple', %s)
where v.id = %s;

create index concurrently youtube_videos_subs_ngram_tsv_idx
  on public.youtube_videos using gin (subs_tsv)
  where l2 in ('zh', 'ja', 'yue', 'nan', … continua list …);

-- phase 1
select id from public.youtube_videos
where l2 = 'zh'
  and subs_tsv @@ websearch_to_tsquery('simple', '中 OR 中国')
order by views desc nulls last
limit 100;
```

Terms of 3+ characters are queried as the AND of their overlapping bigrams —
e.g. `对不起` becomes `对不` AND `不起`, `相形见绌` becomes `相形` AND `形见`
AND `见绌` — so long common terms get the same early-stop walk and rare terms
use the GIN bitmap, with no trigram tokens needed. ILIKE/trigram is kept only
for wildcard searches and terms containing spaces. The existing
`_reduce_subs_to_context` recheck still filters to lines containing the full
literal term.

**Initial cost**

- Medium: one Python backfill script (~315M tokens for the continua corpus),
  a partial GIN index build (prototype: ~8 s for 2,000 zh rows, so roughly
  minutes to an hour at full scale, build concurrently), and small routing
  changes in `utils_content.subs_search`.
- Storage: prototype measured ~85 MB total (heap + GIN) for 2,000 zh rows;
  projected ~7–10 GB for the full continua corpus.
- Maintenance: update tokens on subtitle inserts/updates (app-level or
  trigger); views changes need no token update.

**Result quality**

- Pros: tokens come from the `line` column only, so CSV metadata can never
  produce candidates; the existing line recheck keeps exact-substring
  semantics identical to today for plain terms.
- Cons: char n-grams ignore spaces, so a term containing whitespace would not
  match via the token index. This does not affect zh/ja/th (no word spaces);
  only space-using continua languages (`my`, `bo`, `dz`) or hand-entered
  phrases need the ILIKE fallback.

**Performance**

- Pros: exact lexeme lookups give the planner accurate selectivity, restoring
  the common-term walk / rare-term GIN split that SPEC-044 intended. Prototype
  answered common and rare monograms/bigrams in 0.06–0.9 ms on 2,000 rows.
- Cons: full-scale behavior (planner choice between walk and GIN bitmap at
  122k zh rows) still needs validation; mixed-length term lists need per-term
  routing or an OR of FTS + ILIKE filters.

### Option C — Normalized n-gram posting table

Materialize `subs_ngram_index(l2, gram, video_id, views)` with one row per
unique char/bigram per video and an `(l2, gram, views DESC)` index:

```sql
select video_id from public.subs_ngram_index
where l2 = 'zh' and gram = '中国'
order by views desc nulls last
limit 100;
```

**Initial cost**

- High: ~315M rows for the continua corpus. Prototype: 8.9M postings from
  5,000 zh videos (~706 MB total) took ~4 min to insert + ~25 s to index, so
  full-scale build is hours and projected storage is ~25 GB.
- Maintenance: keep `views` fresh (or accept staleness), maintain on subtitle
  writes, and manage a much larger table than the current corpus.

**Result quality**

- Same as Option B (line-derived tokens + exact recheck); only
  space-containing terms need the ILIKE fallback.

**Performance**

- Pros: guaranteed index-only early-stop walks regardless of planner
  estimates; prototype answered common/rare monograms and bigrams in 1–2 ms.
- Cons: highest storage/build/maintenance cost of the bespoke options; more
  moving parts to keep consistent.

### Option D — `text[]` GIN arrays on the video row

Add `subs_chars text[]` and `subs_bigrams text[]` columns with GIN indexes,
query with `subs_bigrams @> array['中国']`.

**Initial cost**

- Medium-low storage (compact arrays), but GIN build is slow: the bigram
  array index on 10,000 zh rows timed out at 120 s in the prototype, so the
  full build needs careful chunking or `CREATE INDEX CONCURRENTLY`.

**Result quality**

- Same as Options B/C (line-derived tokens + exact recheck); only
  space-containing terms need the ILIKE fallback.

**Performance**

- Pros: exact array containment is indexable and avoids TOAST detoast of
  `subs_l2`; likely fast for both common (walk) and rare (GIN bitmap) terms.
- Cons: planner behavior with `@>` at full scale is unverified; array columns
  add per-row storage and trigger maintenance; slower index builds than a
  tsvector.

### Option E — PGroonga

Enable the `pgroonga` extension (available on this Supabase project, v3.2.5,
not yet installed) and index `subs_l2` with a bigram tokenizer, scoped to
just the continua languages:

```sql
create extension pgroonga with schema extensions;
create index youtube_videos_subs_l2_pgroonga
  on public.youtube_videos
  using pgroonga (subs_l2)
  with (tokenizer = 'TokenBigram')
  where l2 in ('zh', 'ja', 'yue', 'nan', … continua list …);
```

**Initial cost**

- Low-to-medium: no Python backfill, no token table; one extension enablement
  (Supabase dashboard) and one index build.
- Storage: a multi-GB index, but only over the ~195k continua rows (the
  existing full-table pg_trgm index is ~4 GB), so much smaller than a
  whole-table PGroonga index.
- Dependency: adds a non-standard extension to the stack.

**Result quality**

- Pros: supports 1-char and 2-char substring searches directly, and handles
  all term lengths with one index.
- Cons: still needs the Python line recheck for context; behavior on this
  exact corpus (mixed scripts, CSV blobs) must be verified; less portable if
  the project ever leaves Supabase.

**Performance**

- Pros: single index for every length; designed for CJK bigram search.
- Cons: query syntax changes (`&@~` or PGroonga-aware LIKE); index size and
  maintenance characteristics on a 13 GB table are unmeasured here.

## Other options considered and rejected

- **pg_bigm** — a bigram index would be the natural fit for 1–2 char CJK
  search, but it is not available on this Supabase project
  (`pg_available_extensions` has no entry).
- **zhparser / pg_jieba** — Chinese/Japanese segmentation extensions are not
  available on Supabase; segmentation also does not help monogram searches.
- **pg_hint_plan** — forcing the planner onto the `(l2, views)` walk would fix
  common terms but not rare 1–2 char scans, and the extension is not
  available here.
- **Dropping `idx_youtube_videos_l2`** to force the walk — too risky; the
  plain `l2` index serves many other queries (14k+ index scans observed).
- **Separate subtitle-lines table with a trigram index** — still suffers the
  same short-pattern trigram limitation as today.
- **Space-inclusive n-grams** (treating spaces as characters) — would let one
  index handle spaced phrases, but adds noise and storage for no benefit on
  zh/ja/th; the ILIKE fallback is simpler.
- **Explicit term-frequency routing** (estimating a term's frequency in
  Python before choosing walk vs GIN) — a refinement of Option A's safety
  net, not a standalone indexing approach.
- **Hash-based gram keys** (int4 instead of text) — a sizing optimization for
  Option C, not a distinct approach.

## Comparison summary

| Option | Initial cost | Result quality | Performance |
|---|---|---|---|
| A — Status quo + safety net | Low | Same as today | Fast common terms; rare 1–2 char terms remain slow |
| B — N-gram tsvector | Medium (backfill + ~7–10 GB) | Same for plain terms; space-term fallback only | Exact lexeme estimates; prototype 0.06–0.9 ms; needs full-scale validation |
| C — Posting table | High (~25 GB, hours-long build) | Same as B | Guaranteed 1–2 ms index-only walks |
| D — `text[]` GIN | Medium storage, slow GIN build | Same as B | Likely fast; planner behavior unverified |
| E — PGroonga | Low-to-medium (extension + big index) | Same as today, one index for all lengths | Promising; unmeasured on this corpus |

## Decision

**Option B — stored n-gram token tsvector** (2026-08-05).

Use a stored tsvector of unique 1-char and 2-char tokens per continua-language
video, with a partial GIN index, and route continua searches through the same
two-phase FTS flow as SPEC-044. Terms of 3+ characters are matched as the AND
of their overlapping bigrams. ILIKE/trigram remains only for wildcards and
space-containing terms.

**Rationale**: Option B has the best balance of the measured trade-offs —
medium initial cost (backfill + ~7–10 GB) versus ~25 GB for the posting
table, no new extension dependency (vs PGroonga), and it reuses the FTS/GIN
machinery SPEC-044 already validated for word-based languages. The main
remaining risk is planner behavior at full continua scale; it is mitigated by
the bounded walk + GIN fallback and the validation gates in
[SPEC-045](../specs/045-continua-subs-search-ngram-tsv.md).

## Consequences / next steps

- Wire the continua branch through the bounded walk + fallback flow from
  SPEC-044's FTS path so no request can hang on a bad plan.
- Fix `_reduce_subs_to_context` to `re.escape` terms before building the
  match regex (`c++` currently raises `multiple repeat`).
- Add a cache TTL so new videos become searchable without manual clears.
- Extend `profiling_subs_search.py` with the CJK matrix (`中`, `中国`,
  `对不起`, `峥嵘`, `绌`, `私`, `日本`) and require uncached p95 < 1 s.
- Update SPEC-044's verification table (its "Chinese ~0.4s" claim is only
  valid for 3+ char terms) and rewrite ARCH-004's backend section.
- Implementation plan and validation gates are tracked in SPEC-045.
