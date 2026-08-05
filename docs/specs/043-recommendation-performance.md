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
(denormalize `l2`, cache fallback neighbors; keep-warm script delivered but **deferred** —
real traffic warms the index), and **Phase B** — quality fixes that change feed behavior
and are therefore **gated on product decisions** (ef tuning, and the discovery/category
mismatch that is the *root cause* of both jon's fallback and his empty high-level feeds).

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
- **The mode-scoped preference vector rescues this** (verified 2026-08-05): building the
  vector from only the user's non-music signal flips jon's neighborhood to 0–4 % music
  (190–198 discovery survivors) and gives 145–160 L7 survivors. Generalizes: 3/5 sampled
  heavy users were starved (97–100 % music → 0–5 survivors) and were rescued (11–18 %
  music → 158–177 survivors) with no regression for already-healthy users. 74 % of
  EN-signal users have ≥1 non-music video; 23 % have ≥3. See R6.
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

### R3 — Keep-warm the HNSW indexes *(deferred 2026-08-05 — revisit if cold first-hits observed)*
The warm/cold variance is real (ef=500: ~150–550 ms warm vs ~0.7–3.7 s cold). But at
current scale (~16 concurrent users), **real traffic already keeps the active languages'
hot index pages resident** — every feed generation runs the HNSW scan, so R3 adds nothing
during peak use. Its only value is the first request after an idle gap (overnight / zero
traffic) or a deploy/restart — one slow hit, then warm. The script
(`scripts/keep_warm_hnsw.py`) is delivered and tested, but **not scheduled**; enable it
(one cron line for the top 1–2 languages) only if cold first-hits are observed. Constraints
if enabled: periodic background task, NOT request-path, NOT one-shot app-start, NOT per
gunicorn worker; Supabase eviction means it only stabilizes a handful of languages.

### R4 — Raise `ef_search` *(recall; implemented — `VECTOR_EF_SEARCH = 500`, 2026-08-05)*
`ef` is the effective candidate-pool size (pgvector 0.8.2 returns ≈ `ef` rows; hard cap
1000). Swept on the R6 path (`tmp/sweep_ef_r6.py`):
- **L7 in-band survivors (the R5-rejected gap) scale 2–5× with ef** (jon: 155→374→659;
  others 50–129 @ ef=200 → 125–335 @ ef=500 → 253–414 @ ef=1000).
- **E2E L7 feeds**: ef=200 left random fill for 4/5 sampled users (3–17 items); ef=500 →
  20/20 scored for all but the single-channel user; ef=1000 → 20/20 for everyone (the
  larger pool spans more channels, unblocking the 3-per-channel cap).
- **Latency**: warm ~130–190 ms (200) → ~150–550 ms (500) → ~170–1040 ms (1000); cold
  scales superlinearly (~0.3–2.3 s / ~0.7–3.7 s / ~0.6–8 s).

**Decision (2026-08-05): `VECTOR_EF_SEARCH = 500`.** Best quality/cost balance — removes
the last "random fill at high levels" for typical users at ~2× warm cost. ef=1000 kept as
a future toggle for the single-channel-diversity case (best paired with keep-warm R3, which
tames the cold tail). Note: R4 does not address music-starved first passes — that was R6
(the mode-scoped vector), which already makes the first pass succeed.

### R5 — High-level band widening *(rejected — product decision 2026-08-05)*
The strict difficulty band empties high-level feeds when a user's neighborhood has no
in-band content (jon at L7: 0 survivors → random fill). Widening the band to admit
adjacent-level videos would fix that, but it makes level-scoped feeds show videos from
other levels — cards labeled below the requested level — which product decided would be
**confusing level filters**. **R5 is rejected**: the strict band (commit `6ab1aaf`) stays.
High-level feeds keep the strict band; remaining protection comes from R6 (mode-scoped
vectors already put jon's L7 feed fully in-band — 145–160 L7 survivors) and, if needed,
R4 (a larger `ef` neighbor pool gives the band more in-band candidates).

### R6 — Mode-scoped preference vector: fix the discovery/category mismatch
*(quality, product-gated — root cause)*

The root cause: the preference vector is built from the user's *entire* signal
(`_preference_vector` uses likes first, then watch history), so a music-heavy user's
vector lands in a ~96 % music neighborhood, and discovery mode's hard
`not (category = any(10,24))` filter empties it (jon: 6 survivors < 50 → fallback →
seed-driven feed). The metadata embeddings separate music from non-music cleanly, and
most users have a latent non-music signal the likes-first rule ignores.

**Primary approach — build the vector from mode-appropriate signal only:**
- Discovery mode (`music_mode=0`): mean embedding of the user's **non-music** likes +
  recent non-music watch history.
- Music mode (`music_mode=1`): mean embedding of the user's **music** signal (symmetric).
- The HNSW neighborhood is then naturally on-mode; the hard `_filter_neighbors` category
  filter stays as a cheap safety net. Feed stays user-signal-driven; fallback frequency
  drops; no "music in discovery" product change.

Verified live (ef=200, discovery, all levels — `tmp/test_r6_generalize.py`):

| User (signal) | current music-nbrs / survivors | non-music vector music-nbrs / survivors |
|---|---|---|
| jon (8 likes, 73 nm) | 96 % / 6 (fallback) | 0–4 % / 190–198 |
| 291561140@qq (hist 21) | 97 % / 5 | 11 % / 177 |
| tachinethieril (hist 63) | 100 % / 0 | 18 % / 158 |
| mirceacostache6 (hist 21) | 100 % / 1 | 16 % / 165 |
| alikaya.1990 (hist 109) | 5 % / 183 | 4 % / 184 (no regression) |
| 1711239010@qq (hist 35) | 0 % / 204 | 0 % / 206 (no regression) |

Rescues starved users, no regression for healthy ones, and yields high-difficulty
neighbors (jon: 145–160 L7 survivors vs 0) — covering the high-level band starvation that
R5 was originally meant to fix. Breadth: 74 % of EN-signal users have ≥1 non-music video;
23 % have ≥3.

**Fallback for no-signal users**: < N (e.g., 3) non-music videos → no vector → keep the
current all-signal path (which itself falls back to the seed). The earlier soft-penalty
variant (retrieve all neighbors, de-prioritize music in `_rerank_vector`) remains a
product option if discovery should surface ranked-down music for pure-music users instead
of the seed.

Implementation: add `category` to the likes JSON in `get_user_recommendation_context` +
one category lookup for viewed ids; in `_vector_recommend_core`, filter the signal by mode
before `_preference_vector` (with the ≥3 threshold + fallback).

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

#### Step 3 — R3: keep-warm (deferred — script delivered, not scheduled)
Script `scripts/keep_warm_hnsw.py` committed and tested (warms a language's discovery +
music modes via the seed-vector HNSW query at the current `ef`). **Deferred on 2026-08-05**:
at ~16 concurrent users, natural traffic keeps the active language warm, and cold cost is
bounded to one first-hit per idle/deploy gap. Enable only if cold first-hits are observed:
1. Add a cron entry for the top 1–2 languages:
   `*/5 * * * * cd <server> && .venv/bin/python3.10 -u scripts/keep_warm_hnsw.py en`
2. Every N minutes the task issues the seed HNSW query per language+mode (NOT request-path,
   NOT one-shot app-start, NOT per gunicorn worker).
3. **Verify** (when enabled): measure the same query cold-after-idle vs right-after-warm;
   confirm first-request variance collapses for those languages.

### Phase B — Quality (product-gated)

#### Step 4 — R6: mode-scoped preference vector (root-cause quality fix)
1. Product decision: users with ≥3 non-music videos get a user-signal-driven non-music
   discovery feed; pure-music users keep the seed fallback. (Optional variant: soft music
   penalty in `_rerank_vector` instead of the fallback.)
2. Implement: add `category` to the likes JSON in `get_user_recommendation_context` + one
   category lookup for viewed ids; in `_vector_recommend_core`, filter the signal by mode
   before `_preference_vector` (discovery → non-music, music → music) with a ≥3 threshold
   falling back to the current path; keep the hard `_filter_neighbors` category filter as
   a safety net.
3. **Verify**: re-run `tmp/test_r6_generalize.py` — starved users flip from < 50 survivors
   to > 150; jon's feed becomes his non-music taste (tech/educational) instead of the
   seed; sample discovery feeds stay topically coherent. Re-run
   `tmp/profiling_recommendations_full_jon.py` (fallback frequency should drop).
4. This also reduces R1's fallback hits (still keep R1), and the naturally higher
   difficulty of non-music neighborhoods covers the high-level case R5 was meant to
   address (R5 is rejected — see R5).

#### Step 5 — R4: `ef_search` tuning ✅ (implemented 2026-08-05)
1. Swept `ef` (200/500/1000) on the R6 path via `tmp/sweep_ef_r6.py`: L7 in-band survivors
   2–5× with ef; E2E L7 feeds go 20/20 scored at ef=500 for all but the single-channel user.
2. Decided **`VECTOR_EF_SEARCH = 500`** (quality/cost sweet spot; ~2× warm, superlinear
   cold — pair keep-warm R3 for the cold tail). ef=1000 documented as a future toggle for
   single-channel diversity.
3. `_FALLBACK_NEIGHBOR_CACHE` key already includes ef, so no stale-neighbor risk.

## Verification

- **Feed-identity guardrail (Phase A)**: pure-perf changes must not change the returned
  feed for a fixed user/settings (jon, all levels; a like-signal user; a history-signal
  user). Diff titles+ids, ignoring random fill.
- **Profiling** (scripts live in `tmp/`, gitignored): `tmp/profiling_recommendations_full_jon.py`
  (per-substep), `tmp/profiling_hnsw_jon.py` (HNSW cold/warm), `tmp/profiling_recommendations_ef.py`
  (ef sweep), `tmp/verify_recommendation_assessment.py` (schema + survivor checks),
  `tmp/test_r6_signal_idea.py` (non-music vector vs current, jon), `tmp/test_r6_generalize.py`
  (multi-user R6 sweep). Re-run after each step; record before/after in
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
- **R3 (if enabled)**: run keep-warm once (cron or single worker role), never per gunicorn
  worker; best-effort — Supabase eviction limits it to a handful of languages.
- **R4 cold cost**: ef=500 cold ≈ 0.7–3.7 s (ef=1000 ≈ 4–8 s). R3 (deferred) would tame the
  cold tail; without it, first-hits after idle/deploy pay the cold scan — bounded to one per
  cache window by the 5-min feed cache.
- **R6 changes feed content** (not a reversal of the "discovery = no music" contract —
  the hard filter stays): users with enough non-music signal get their own non-music taste
  instead of the seed's. Pure-music users still fall back to the seed. Ship behind the
  product decision and review sample feeds before rollout.

## Open Questions

1. For users with < 3 non-music videos, should discovery fall back to the seed (primary
   R6) or to the soft-penalty variant that surfaces ranked-down music (product option)?
2. Should `ef=1000` ever be enabled for single-channel diversity (the only remaining L7
   fill case, currently 3/17 for 1711239010)?
3. If R3 keep-warm is ever enabled, which languages to prioritize — request-volume-driven
   or static list?
4. Should R1's cache also cover the *first-pass* HNSW for anonymous/no-signal users
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
- Profilers (in `tmp/`, gitignored): `profiling_recommendations_full_jon.py`,
  `profiling_recommendations_ef.py`, `profiling_hnsw_jon.py`, `verify_recommendation_assessment.py`,
  `verify_fallback_source.py`, `test_r6_signal_idea.py`, `test_r6_generalize.py`
- ADR-0021 (video content → Supabase) — context for the `user_watch_history` schema
