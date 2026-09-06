# Difficulty → Level Bucketing

This document describes how a raw `video.difficulty` score is turned into a
1–7 level and, more importantly, how the per-language **thresholds** that do
that conversion are computed. See [032 – YouTube Video
Difficulty](032-youtube-video-difficulty.md) for how the `difficulty` score
itself is derived. This doc covers only the bucketing/leveling step.

## What it produces

A per-language array of 7 thresholds, `DIFFICULTY_PROFILE[lang] = [t1 … t7]`,
where a video is level `N` when `t_{N-1} < difficulty ≤ t_N` (level 1 is
`difficulty ≤ t1`, level 7 is `difficulty > t6` up to `t7`). The same array
serves both the client badge and content filtering (a learner at level `N`
should only see content up to `t_N` in difficulty).

These arrays are the **single source of truth** for difficulty levels. They
live in `zerotohero-python-server/utils_language.py` as `DIFFICULTY_PROFILE`
and are served verbatim to web/mobile via `GET /difficulty-profiles`. The
client maps them with `getLevelFromDifficulty(difficulty, profile)` in
`@langplayer/shared`.

## How the thresholds are computed

The thresholds are **derived from the catalog itself**, not hand-written.
`data/difficulty_profile/difficulty_profile_{lang}.csv` holds every scored
video's `difficulty` for a language, sorted ascending. `calculate_max_difficulties()`
(`utils_video_lemma.py`) splits that sorted list into 7 buckets whose sizes
follow a geometric progression, then takes the difficulty at the end of each
bucket as the boundary.

### The algorithm

```python
def calculate_max_difficulties(difficulties, growth_factor=2):
    total = len(difficulties)
    max_difficulties = []
    indices = [0]
    end_index = 0
    sum_powers = sum(growth_factor ** i for i in range(7))   # Σ gf^i, i=0..6
    for i in range(7):
        end_index += round((total / sum_powers) * (growth_factor ** i))
        indices.append(min(end_index, total - 1))
        max_difficulties.append(difficulties[min(end_index - 1, total - 1)])
    return max_difficulties, indices
```

- `sum_powers` normalizes the share: bucket *i*'s fractional size is
  `total / Σ(gf^k) * gf^i`, so each bucket is `growth_factor` times the one
  before it.
- `end_index` is the **cumulative end** of bucket *i*.
- The level-`N` threshold is `difficulties[end_index - 1]` — the difficulty of
  the **last video in the bucket**, i.e. the maximum difficulty a video can have
  and still be "in" level `N`.
- `indices` are returned too, so the caller reports *how many* videos land in
  each level (`indices[i+1] - indices[i]`).

`growth_factor=2` is the default. A higher factor makes bucket sizes grow
faster: level 1 gets a smaller share and the top levels bigger ones.

### Worked example (Chinese, `growth_factor=2`)

Run against the on-disk snapshot (`difficulty_profile_zh.csv`, 149,298 scored
videos):

```
sum_powers = 1 + 2 + 4 + 8 + 16 + 32 + 64 = 127
total / 127 = 1175.6
```

| Level | Ideal size | Cum. end index | Videos in level | Share | Threshold (difficulty at end-1) |
|---|---|---|---|---|---|
| 1 | 1175.6 | 1,176 | 1,176 | 0.8% | 0.0044392 |
| 2 | 2351.1 | 3,527 | 2,351 | 1.6% | 0.0065217 |
| 3 | 4702.3 | 8,229 | 4,702 | 3.1% | 0.0081406 |
| 4 | 9404.6 | 17,634 | 9,405 | 6.3% | 0.0099058 |
| 5 | 18809.2 | 36,443 | 18,809 | 12.6% | 0.0124205 |
| 6 | 37618.4 | 74,061 | 37,618 | 25.2% | 0.0174544 |
| 7 | 75236.8 | 149,297 | 75,236 | 50.4% | 0.230341 |

The geometric scheme is deliberately **top-heavy**: the largest share of the
catalog lands in the top level. That is a property of `growth_factor=2` plus
the right-skewed difficulty distribution, not a bug.

## Growth factor: 2 (the default)

`growth_factor=2` is the canonical, code-default value and is what new /
regenerated profiles should use. The `notebook_recommendations.ipynb` workflow
also ran with `growth_factor=2.5` ("make beginner videos easier", the 2024-05-17
`8a853f3` experiment), but that change was reverted the same day (`ff07ada`),
so `2.5` should not be used going forward.

## Importing the profile into the app

After computing `max_difficulties`, they are pasted into `DIFFICULTY_PROFILE`
in `utils_language.py` (36 languages), which is what clients actually receive.

Regeneration runbook (after any re-scoring campaign):

```python
from utils_video_lemma import create_difficulty_profile_csv, create_difficulty_profile
create_difficulty_profile_csv()                 # refresh per-language CSV dumps
difficulty_profile, level_counts = create_difficulty_profile(growth_factor=2)
# copy difficulty_profile[lang] values into utils_language.DIFFICULTY_PROFILE
```

Verify your work before committing the copy:

```python
from utils_video_lemma import calculate_max_difficulties, read_difficulty_file
maxd, idx = calculate_max_difficulties(read_difficulty_file('zh'), growth_factor=2)
print(maxd)   # should equal DIFFICULTY_PROFILE['zh'] for a fresh snapshot
```

## Caveats

- **The shipped profile is stale.** `DIFFICULTY_PROFILE['zh']` dates from
  `8ba2c17` (2023-10-16) and was computed against a smaller/older snapshot.
  On the current on-disk snapshot the `growth_factor=2` boundaries are
  `[0.0044392, 0.0065217, 0.0081406, 0.0099058, 0.0124205, 0.0174544, 0.230341]`,
  which differ from the shipped `[0.00327454, 0.0055798, 0.00765939,…]`. They
  agree at the top (0.230341 = max difficulty) and diverge in the lower levels.
  Re-run the runbook after re-scoring so the boundaries track the current catalog.
- **Snapshot vs live divergence.** The on-disk `difficulty_profile_zh.csv`
  holds 149,298 zh videos; live Supabase `public.youtube_videos` holds 121,834
  (121,777 scored). The CSV is a 2024-05-17 artifact of the legacy Directus
  pipeline and is not git-tracked. Regenerate it from the live store before
  trusting the numbers.
- **Legacy duplicates removed.** `MAX_DIFFICULTY_BY_LEVEL` in `level_mapping.py`
  and `MAX_DIFFICULTY` in `packages/utils/src/difficulty.ts` were second copies
  of this data (and drifted — no zh entry, hand-tuned values) and are removed.
  `DIFFICULTY_PROFILE` is the only source.

## Files

| File | Role |
|---|---|
| `zerotohero-python-server/utils_video_lemma.py` | `calculate_max_difficulties`, `create_difficulty_profile_csv`, `create_difficulty_profile` |
| `zerotohero-python-server/utils_language.py` | `DIFFICULTY_PROFILE` (the values) |
| `zerotohero-python-server/routes/core.py` | `GET /difficulty-profiles` |
| `zerotohero-python-server/data/difficulty_profile/*.csv` | Per-language sorted difficulty dumps (input) |
| `packages/shared/src/constants.ts` | `getLevelFromDifficulty` (client mapping) |
| `zerotohero-nuxt/lib/utils/language-levels.js` | Classic ancestor (`levelByDifficulty`, `MAX_DIFFICULTY_BY_LEVEL`) |
