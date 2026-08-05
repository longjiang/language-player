# SPEC-043 — Recommendation Pipeline Performance & Quality Optimization

## Metadata

- **Spec ID**: SPEC-043
- **Feature**: Vector recommendation pipeline optimization (`app_recommendations._vector_recommend_core`)
- **Status**: draft
- **Created**: 2026-08-05
- **ROADMAP Phase**: Phase 9: Backend Consolidation (backend performance on `zerotohero-python-server`)

## Overview

The vector recommendation path (`GET /recommend-videos` → `app_recommendations.recommend_videos`
→ `_vector_recommend_core`) is the hot path for feed generation. Profiling a heavy user
(jon, `l2=en`, all levels, `page=0`, caches cleared) shows a **cold first-request cost of ~8.4 s**
for 20 videos, dominated by two things:

1. **HNSW candidate scans** — 2 × ~2.2 s. pgvector 0.8.2 caps results at `ef_search`
   (200 → exactly ~200 rows; the `LIMIT 5000` is a no-op). The second scan is the
   `< 50`-survivor fallback, which re-runs the same user-independent HNSW scan.
2. **The user-context SQL** — ~2.3–3.8 s. It does a PK lookup on `youtube_videos` for
   **every** `user_watch_history` row (4188 for jon → 143 EN) to filter `l2`, because
   `l2` lives on `youtube_videos`, not on `user_watch_history`.

This spec defines a two-phase plan: **Phase A** — behavior-neutral performance fixes
(denormalize `l2`, cache fallback neighbors, keep-warm), and **Phase B** — quality fixes
that change feed behavior and are therefore **gated on product decisions** (ef tuning,
level-band widening, and the discovery/category mismatch that is the *root cause* of both
jon's fallback and his empty high-level feeds).

All numbers below were verified against the live database on 2026-08-05
(`verify_recommendation_assessment.py`, `verify_fallback_source.py`, and prior
`profiling_*.py` scripts).

## Background — measured current state

| Step | Cold cost (jon, all levels) | Root cause (verified) |
|---|---|---|
| HNSW scan (`_vector_candidates` q1) | ~1.4–4.8 s each | Cold reads of the 1.2 GB EN HNSW index + vector pages; **results capped at `ef_search` (200 rows)** — `LIMIT 5000` is a no-op |
| user_context SQL | ~2.3–3.8 s | 4188-row history; Nested Loop + Memoize doing **4188 PK lookups** on `youtube_videos` to filter `l2='en'` (143 pass) |
| 2nd HNSW scan (fallback) | ~1.4–2.5 s | First pass yields < 50 survivors → re-runs HNSW with the cold-start seed (user-independent) |
| pool_count | ~0.8 s (cold) | `count_videos` live; 5-min `_POOL_COUNT_CACHE` in production |
| metadata filter (`_vector_candidates` q2) | ~190 ms | Fine |
| pref_vector / rerank | ~0.3 s / 1.6 ms | Fine |

### Key verified facts that constrain the design

- **pgvector 0.8.2 returns ~`ef_search` rows** (measured: 100→100, 200→200, 500→500,
  1000→1008). `neighbor_limit = max(k*3, 5000)` never binds; the effective candidate-pool
  size is `ef_search`. This makes `ef` the real recall knob (see R4).
- **jon's first-pass starvation is a category mismatch, not excludes.** Of his 200
  neighbors at ef=200, only 8 overlap his 151 excludes, but **192 are music-category
  (10/24)**. Discovery mode (`music_mode=0`) hard-filters music → 6 survivors → fallback.
- **jon's all-levels feed comes from the fallback** (cold-start-seed neighborhood,
  160 survivors), not his own preference vector (6 survivors). "Vector rec works" today
  only because the fallback rescues music-heavy users.
- **Level 7 = empty vector feed.** jon's vector: 0 discovery survivors at L7
  (band `difficulty >= 0.00807`); fallback seed: 16 (< 50) → feed is 9 vector + 11 random
  fill (100 % fill on the paginated page-6 path where growing excludes exhaust even the
  fallback).
- **`user_watch_history` has no `l2` column** (legacy Directus schema had one).
  Single Supabase runtime writer: `upsert_watch_history` (`utils_user_data.py:342`),
  called from `POST /watch-history` (`routes/user_data_columns.py:489`).
- **Fetch-recent-500-and-filter-in-Python regresses behavior**: jon's most recent 500
  rows contain only **14 EN ids** vs 143 today (373 ja / 46 fr / 29 zh / 23 ko / 14 en).
  Denormalization is the only semantics-preserving option.
- Commit history: `6ab1aaf` "Enforce strict difficulty-level filter…" (the strict band),
  `8de919c` "Lower HNSW ef_search to 200…" (recent change), `d018954` random in-band fill.

## Goals

- Cut the cold first-request cost for heavy users from ~8.4 s to ~0.5 s (warm steady-state)
  with **zero change to feed content** (Phase A).
- Fix the quality gaps that today push music-heavy users and high-level users onto
  seed-driven or random feeds (Phase B, product-gated).
- Add durable verification (profiling + EXPLAIN + feed-identity guardrails) so regressions
  are caught before merge.

## Non-Goals

- Rewriting the recommendation algorithm or the embedding model.
- Changing the `_page_cache` TTL / pagination contract.
- Making keep-warm hold all ~14 GB of per-language HNSW indexes in memory (not feasible on
  Supabase shared_buffers).
- Any `ef`/band/category behavior change without a product sign-off.

---

## Recommendations (consolidated from both analyses)

### R1 — Cache the fallback HNSW neighbor list *(perf, behavior-neutral)*
The fallback vector is the `_cold_start_seed` (most-viewed video for `(l2, music_mode)`),
which is already cached per language+mode. The fallback's HNSW scan is therefore
**user-independent**; per-user differences (excludes, not_interested, level, made_for_kids)
are all applied later in the metadata filter. Store `[(video_id, sim)]` keyed by
`(l2, music_mode)` (5-min TTL, same as `_COLD_START_CACHE`) and skip the HNSW query in the
fallback branch. Saves ~1.4–2.5 s per fallback hit. The first fallback request in each
5-min window still pays the scan — pair with keep-warm (R3).

### R2 — Denormalize `l2` into `user_watch_history` + index *(perf, behavior-neutral)*
The robust fix. Add `l2 text` to `user_watch_history`, backfill ~204k rows from the join,
add index `(user_id, l2, date DESC)`, rewrite the viewed-history subquery to filter
`wh.l2` directly, and set `l2` on write in `upsert_watch_history`. This turns the
4188-lookup join into a ~143-row index scan (3.8 s → ~10–30 ms) while preserving exact
semantics (top 500 EN by date). Re-aligns with the legacy Directus schema that had `l2`.
Rejected alternatives (verified): recent-500-filter-in-Python (14 vs 143 EN ids — behavior
regression), hash semi-join with current indexes (~4.2 s — worse).

### R3 — Keep-warm the HNSW indexes *(perf, secondary)*
The warm/cold variance is real (ef=200: ~93 ms warm vs 1.4–4.8 s cold). But the EN index
alone is 1.2 GB and all per-language indexes total ~14 GB, so Supabase will evict.
Keep-warm only helps a handful of active languages and must be a **periodic background
task** (not request-path, not one-shot app-start). Optionally drive it off the most-used
languages.

### R4 — Raise `ef_search` *(recall; corrected benefit)*
`ef` is the effective candidate-pool size (results ≈ `ef`). Raising 200 → 500/1000 enlarges
the pool and helps high-level bands, at **superlinear cold cost** (measured: ef=500 ≈ 4.3–8.6 s
cold vs ~1.7 s at ef=200; warm 130 ms vs 93 ms). **It does not fix jon's first-pass
fallback** — his neighborhood is ~96 % music, so discovery mode still filters it out at any
ef. Raise `ef` only after R3 (keep-warm) tames the cold cost, and gate on a survivor-count /
recall measurement (see verification).

### R5 — Fix the high-level band → random fill *(quality, product-gated)*
Confirmed: strict band (L7 = `difficulty >= 0.00807`) rejects jon's neighbors → empty
vector feed at high levels. "Widen the band" reverses `6ab1aaf`; a **controlled widening**
is safer: include adjacent levels in the candidate filter and let the existing
`_rerank_vector` `diff_penalty` (0.04 × `_band_distance`) order them, rather than removing
the filter. Note two prior causes must also be fixed or L7 still leans on the fallback:
the category mismatch (R6) and the ef cap (R4).

### R6 — Fix the discovery/category mismatch *(quality, product-gated — root cause)*
The real reason jon's first pass fails: a music-heavy preference signal in discovery mode
finds a ~96 % music neighborhood, and the hard `not (category = any(10,24))` filter empties
it. Proposal: in discovery mode, retrieve neighbors **without** the hard music exclusion
and move music de-prioritization into `_rerank_vector` as a soft category penalty. Keeps
the feed user-signal-driven (instead of seed-driven) and cuts fallback frequency (synergy
with R1). This is a visible product change — music videos would appear in discovery feeds
for music-heavy users — so it needs product sign-off.

---

## Data model changes (R2)

```sql
-- 1. Column (nullable; matches youtube_videos.l2 ISO-code format, e.g. 'en')
ALTER TABLE public.user_watch_history ADD COLUMN l2 text;

-- 2. One-time backfill (~204k rows; orphans keep NULL and are excluded, same as today's join)
UPDATE public.user_watch_history wh
SET l2 = v.l2
FROM public.youtube_videos v
WHERE v.id = wh.video_id
  AND wh.l2 IS NULL;

-- 3. Index for the recommendation query
CREATE INDEX idx_user_watch_history_user_l2_date
  ON public.user_watch_history (user_id, l2, date DESC);
```

### Write path (`utils_user_data.py:342` `upsert_watch_history`)

```sql
INSERT INTO public.user_watch_history (user_id, video_id, l2, last_position, date, created_at)
VALUES (%s, %s, (SELECT l2 FROM public.youtube_videos WHERE id = %s), %s, %s::timestamptz, now())
ON CONFLICT (user_id, video_id) DO UPDATE SET
  last_position = excluded.last_position,
  date          = excluded.date,
  l2            = excluded.l2
RETURNING id
```

One PK lookup per write — negligible. `l2` is refreshed on conflict, which also heals any
stale values.

### Read path (`utils_content.py:936` `get_user_recommendation_context`)

The viewed-history subquery becomes:

```sql
SELECT wh.video_id FROM public.user_watch_history wh
WHERE wh.user_id = %s AND wh.l2 = %s
ORDER BY wh.date DESC NULLS LAST LIMIT 500
```

The likes and prefs subqueries are unchanged. Result is byte-identical to today for all
users (verified plan: pure index scan of ~143 rows vs 4188-lookup join).

---

## Implementation Plan

> Phase A is **behavior-neutral**: the returned feed must be identical (modulo the existing
> random fill). Each step lands, verifies, and ships independently. Phase B changes feed
> content and is gated on product sign-off.

### Phase A — Performance (no behavior change)

#### Step 1 — R2: denormalize `l2` + index (biggest, most robust win)
1. Run the migration SQL (add column → backfill → index) as a one-time script
   (`scripts/` or `tmp/`), dry-run on a copy first.
2. Update `upsert_watch_history` to set `l2`.
3. Rewrite the viewed-history subquery in `get_user_recommendation_context`.
4. **Verify**: `EXPLAIN (ANALYZE, BUFFERS)` on the new query → expect ~143-row index scan,
   ~10–30 ms (was 3.8 s, 4188 Memoize misses). Run `profiling_recommendations_full_jon.py`:
   `user_context` should drop from ~2.3 s to tens of ms.
5. **Feed-identity check**: diff the returned feed for jon (all levels) before/after —
   must be identical (excluding random fill).
6. Rollback: `DROP INDEX`, drop column (after confirming no writer depends on it).

#### Step 2 — R1: cache fallback HNSW neighbors
1. Refactor `_vector_candidates` (`app_recommendations.py:498`) into two functions:
   - `_hnsw_neighbors(conn, vec, l2_code, neighbor_limit) -> [(video_id, sim)]`
   - `_filter_neighbors(conn, neighbors, l2_code, exclude_ids, not_interested, level,
     music_mode, made_for_kids) -> rows` (the existing metadata-filter half)
   `_vector_candidates` becomes the composition, so the main path is unchanged.
2. Add `_FALLBACK_NEIGHBOR_CACHE: dict[tuple, tuple[list, float]]` keyed by `(l2_code,
   music_mode)`, TTL `_CACHE_TTL_SEC` (300 s). In the fallback branch of
   `_vector_recommend_core`, if a fresh entry exists, call `_filter_neighbors` directly
   with the cached `(video_id, sim)` list (skips the HNSW scan); else run
   `_hnsw_neighbors(seed_vec, …)`, store it, and filter.
3. **Verify**: jon all-levels run → exactly 1 HNSW scan after the first fallback hit
   (candidates: 2 calls → 1 on repeat). Feed identity preserved (same neighbor list +
   same filter ⇒ same rows).
4. Caveat: if R4 later changes `ef`, the cache key must include `ef` (or the cache is
   invalidated on deploy).

#### Step 3 — R3: keep-warm (background, active languages only)
1. Add a small scheduled task (e.g., an APScheduler job or a cron script; NOT a per-worker
   thread in every gunicorn worker, NOT in the request path).
2. Every N minutes, for the top active languages (by request volume or `_POOL_COUNT_CACHE`
   activity), issue the cold-start seed HNSW query at the current `ef`.
3. **Verify**: measure the same query cold-after-idle vs right-after-warm; confirm the
   first-request variance collapses for those languages.
4. Keep it optional/disable-able; Supabase eviction means this only stabilizes a few
   languages at a time.

### Phase B — Quality (product-gated)

#### Step 4 — R6: discovery/category mismatch (root-cause quality fix)
1. Product decision: allow music videos into discovery feeds for music-heavy users, ranked
   below non-music by a soft penalty.
2. Implement: `_hnsw_neighbors`/`_filter_neighbors` drop the hard music exclusion in
   discovery mode; add a category penalty term in `_rerank_vector` (only for
   `music_mode=0`).
3. **Verify**: jon's first pass now returns > 50 survivors (feed from his own signal, not
   the seed); fallback frequency drops. Review a sample of discovery feeds for non-music
   users to confirm non-music still dominates.
4. This also materially reduces the value split of R1 (fewer fallback hits) — still keep R1.

#### Step 5 — R5: controlled high-level band widening
1. Product decision on which adjacent levels to include per requested level.
2. Implement: widen the band bounds used by `_filter_neighbors` (candidate retrieval) only;
   leave `_rerank_vector`'s strict `_band_distance` penalty intact so ordering still favors
   in-band videos.
3. **Verify**: jon at level=7 → vector-scored, topically-relevant videos instead of random
   fill; measure in-band vs adjacent distribution in the feed.

#### Step 6 — R4: `ef_search` tuning (after keep-warm is live)
1. Sweep `ef` (200/500/1000) via `profiling_recommendations_ef.py`: report survivor counts
   per user class (like-signal, history-signal) and warm/cold latency.
2. Raise `ef` only if recall gains justify the cold cost (keep-warm should have tamed it).
3. Update the `hnsw.ef_search` constant and any R1 cache key.

## Verification

- **Feed-identity guardrail (Phase A)**: pure-perf changes must not change the returned
  feed for a fixed user/settings (jon, all levels; a like-signal user; a history-signal
  user). Diff titles+ids, ignoring random fill.
- **Profiling**: `profiling_recommendations_full_jon.py` (per-substep), `profiling_hnsw_jon.py`
  (HNSW cold/warm), `profiling_recommendations_ef.py` (ef sweep), `verify_recommendation_assessment.py`
  (schema + survivor checks). Re-run after each step; record before/after in
  `/memories/repo/recommendations-performance.md`.
- **EXPLAIN**: user_context before (Nested Loop + 4188 Memoize) vs after (index scan ~143).
- **Load**: after Phase A, cold first-request for jon should go ~8.4 s → ~0.5 s (one warm
  HNSW scan + ~30 ms context + ~200 ms filter); repeats stay cached.

## Risks & Edge Cases

- **R2 backfill orphans**: rows whose video was deleted keep `l2 NULL` and are excluded —
  identical to today's join behavior. No action needed.
- **R2 video re-language**: videos don't change language in practice; the upsert refreshes
  `l2` on conflict anyway.
- **R1 cache correctness**: cache key must include `ef` if R4 changes it; TTL must match
  `_CACHE_TTL_SEC` so a stale neighbor list never outlives the page cache.
- **R3 multi-worker**: a keep-warm thread per gunicorn worker multiplies work; run it once
  (single worker role or cron) and tolerate it being best-effort.
- **R4 cold cost**: ef=500 cold ≈ 4.3–8.6 s — do not raise ef before R3, and never on the
  request path.
- **R5/R6 are reversals of `6ab1aaf` and the discovery contract**: they change what users
  see; ship behind the product decision and review sample feeds before rollout.

## Open Questions

1. Does product want music videos in discovery feeds for music-heavy users (R6)?
2. Which adjacent levels should a high-level feed include (R5)?
3. Is `ef=500` acceptable once keep-warm is live (R4)?
4. Which languages should keep-warm prioritize (R3) — request-volume-driven or static list?
5. Should R1's cache also cover the *first-pass* HNSW for anonymous/no-signal users
   (same seed vector), or is the fallback path enough?

## References

- `app_recommendations.py` — `_vector_recommend_core` (752), `_vector_candidates` (498),
  `_cold_start_seed` (574), `_fill_random_in_band` (602), `_rerank_vector` (691),
  `_preference_vector` (469), `recommend_videos` (826)
- `utils_content.py` — `get_user_recommendation_context` (936), `count_videos` (420)
- `utils_user_data.py` — `upsert_watch_history` (342)
- `routes/user_data_columns.py` — `POST /watch-history` (489)
- `routes/video.py` — `GET /recommend-videos` (213)
- Commits: `6ab1aaf` (strict band), `8de919c` (ef 200), `d018954` (random fill)
- Profilers: `profiling_recommendations_full_jon.py`, `profiling_recommendations_ef.py`,
  `profiling_hnsw_jon.py`, `verify_recommendation_assessment.py`, `verify_fallback_source.py`
- ADR-0021 (video content → Supabase) — context for the `user_watch_history` schema
