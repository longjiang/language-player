# YouTube Video Difficulty

Every video in the catalog carries a numeric `difficulty` score, and the UI
turns that into a 1–7 level badge (HSK for Chinese, JLPT for Japanese, CEFR
for everything else). This document explains where both numbers come from,
how the per-language level thresholds are computed, notes the known data
issue, and documents the dependency constraints.

## Quick answer

```
difficulty = lex_div / word_freq
```

where `lex_div` is a **lexical-diversity** measure (MTLD, scaled) and
`word_freq` is the **average Zipf frequency** of the video's unique lemmas.
A video with more diverse vocabulary (higher `lex_div`) and rarer words
(lower `word_freq`) gets a higher difficulty.

`lex_div` and `word_freq` are computed once per video by the backend and
stored in the `youtube_videos` table alongside `difficulty`. The 1–7 level is
NOT stored — it is derived client-side from `difficulty` plus a per-language
threshold array (`DIFFICULTY_PROFILE`).

## The pipeline

All of this lives in `zerotohero-python-server/utils_video_lemma.py`, with
the NLP helpers in `utils_nlp.py`.

### 1. Lemmatize the subtitles

`lemmatize_video()` reads the video's `subs_l2` subtitle CSV, decodes HTML
entities (SPEC-091), strips each line, and lemmatizes every line with the L2
lemmatizer (`lemmatize_subs_lines_and_store_in_hash_table()`). Lines are
keyed by the MD5 of the decoded line text and cached (the `lemmatized_subs`
cache), so repeated subtitle lines are never re-processed and identical
lines across videos hit the same cache entry (SPEC-061 keys the cache by the
legacy Directus ID).

For Chinese, `lemmatize_chinese.py` uses jieba POS segmentation
(`dict.txt.big` for traditional coverage, per ADR-0019) + pypinyin. For
Chinese the "lemma" is identical to the surface word (no inflection).

### 2. Fold the lemmas

`get_lemmas_from_video()` maps every lemmatized line through
`lemmatizer.extract_lemmas()` (which drops punctuation tokens) and flattens
the per-line lists into **one ordered lemma sequence**. That sequence
preserves subtitle word order, which matters for MTLD.

### 3. Lexical diversity (`lex_div`)

`mtld_from_lemmas()` implements MTLD — Measure of Textual Lexical Diversity
— over the ordered lemma sequence with a TTR (type–token ratio) reset
threshold of `0.72`. Two passes are averaged (forward + reversed order).
Then:

```python
lex_div = mtld / 1000
if lex_div >= 1: lex_div = 0.9999999999999999   # cap
```

So `lex_div` is the MTLD score divided by 1000, capped just below 1 (a long,
highly diverse video can exceed the cap). Observed Chinese values range from
~0.002 (MTLD ~2 — very short/repetitive content) to ~0.27 (MTLD ~270 —
long, vocab-dense content).

### 4. Zipf frequency (`word_freq`)

`word_freq_from_lemmas()`:

1. Take the **unique** lemmas (types) — `set(lemmas)`.
2. For each type, `zipf_frequency(type, lang_code)` from the `wordfreq`
   package (Zipf scale: ~7 = everyday word, ~1 = rare).
3. Missing/zero entries fall back to `low_zipf_freq = 2.5`.
4. Average across all types, rounded to 2 decimals.

So `word_freq` is the average commonness of the vocabulary. It typically
sits in the 3.5–5.5 range for Chinese videos.

### 5. Difficulty

`generate_update_sql()` writes all three columns in one UPDATE:

```sql
difficulty = lex_div / word_freq
```

`add_lex_div_and_word_freq_to_video()` is the incremental scorer: it only
computes whichever of `lex_div` / `word_freq` is still NULL (keeping existing
values), then writes all three. Batch entry point:
`add_lex_div_and_word_freq_to_all_videos(lang_code)`.

## Level bucketing (difficulty → 1–7)

Detailed threshold-generation algorithm and the `growth_factor` decision: see
[033 – Difficulty → Level Bucketing](033-difficulty-level-bucketing.md).

### How the thresholds are generated

The per-language threshold arrays are computed from the catalog itself,
`create_difficulty_profile()` / `calculate_max_difficulties()`:

1. `create_difficulty_profile_csv()` dumps `youtube_id, lex_div, word_freq,
   difficulty` for every scored video of a language, sorted by difficulty,
   to `data/difficulty_profile/difficulty_profile_{lang}.csv`.
2. `calculate_max_difficulties(difficulties, growth_factor=2)` splits the
   sorted list into 7 **geometric buckets**: bucket *i* gets
   `growth_factor^i` proportional share of the total count. The threshold
   for level *N+1* is the difficulty of the last video in bucket *N*:

```
count_i = round(total / Σ(growth_factor^k, k=0..6) * growth_factor^i)
```

   A higher `growth_factor` makes the bucket sizes grow faster (level 1 gets
   a smaller share, the top levels larger ones). The notebook
   `notebook_recommendations.ipynb` documents the workflow; it runs with
   `growth_factor=2.5`, and that was also what the 2024-05-17 "make beginner
   videos easier" profile experiment (`8a853f3`, later reverted in
   `ff07ada`) used.
3. The result is written into `DIFFICULTY_PROFILE` in
   `zerotohero-python-server/utils_language.py` (36 languages), which the
   backend serves verbatim via `GET /difficulty-profiles`.

### Client-side mapping

`getLevelFromDifficulty(difficulty, profile)` in `packages/shared` is the
single mapping function (web + mobile):

```ts
for (let i = 0; i < profile.length; i++)
  if (difficulty <= profile[i]) return i + 1;
return profile.length;   // 7
```

Chinese thresholds (authoritative):

```
zh: [0.00327454, 0.0055798, 0.00765939, 0.00958302, 0.0121889, 0.0172213, 0.230341]
```

Example: `difficulty = 0.006212` → level 3 (0.00558 < 0.006212 ≤ 0.00766).

### Level → exam mapping

The numeric level maps to an exam level via `LEVELS` in
`level_mapping.py` (and Classic's `lib/utils/language-levels.js`): zh → HSK
(1–6, then 7–9 for level 7), ja → JLPT, ko → TOPIK, en → IELTS, everything
else → CEFR.

## Source of truth (and what was removed)

`DIFFICULTY_PROFILE` (server) is the single source of truth for thresholds.
Classic's `lib/utils/language-levels.js` carries the same values (it also
defines `levelByDifficulty`, which is the ancestor of
`getLevelFromDifficulty`; Classic uses a strict `<` and returns 7 above all
levels, while the shared function uses `<=` and `profile.length` — at exact
threshold values the Classic and current behavior differ by one level).

Three duplicates existed and diverged; all are gone:

| Duplicate | Problem | Resolution |
|---|---|---|
| `level()` in `utils_video_lemma.py` — hardcoded `[0.00292618, …]` | One stale global threshold list applied to every language; returned `None` above the last threshold; only used for the batch progress log | Now takes `(difficulty, lang_code)` and reads `DIFFICULTY_PROFILE`; mirrors the client semantics; returns `None` only when a language has no profile |
| `MAX_DIFFICULTY_BY_LEVEL` in `level_mapping.py` | Incomplete port of Classic (no `zh` entry, stale `uk`/`vi` values) and never referenced anywhere in the server | Removed; comment points at `DIFFICULTY_PROFILE` |
| `MAX_DIFFICULTY` + `clampDifficulty` in `packages/utils/src/difficulty.ts` | Hand-tuned round numbers for en/ja/ko/zh that matched Classic nowhere; dead (no app imported it, and the real level path uses the server profile) | Removed (`levelFromHours`/`hoursFromLevel` kept) |

When `/difficulty-profiles` cannot be fetched, level badges are **omitted**
(no fallback level) — there is no hardcoded fallback on the client.

## Known data issue: inconsistent `difficulty` rows

A full-precision scan of the Chinese catalog found rows where
`difficulty ≠ lex_div / word_freq` by far more than float32 precision:

| Dataset | Rows | % deviating > 0.1% | % deviating > 1% |
|---|---|---|---|
| Legacy snapshot (`difficulty_profile_zh.csv`) | 149,298 | 7.1% | 5.4% |
| Live Supabase (`public.youtube_videos`, l2='zh') | 121,777 scored | 4.2% | 3.5% |

- Deviations go up to ~92% (e.g.
  `0LRU2mcsTRY`: stored `difficulty = 0.01896` → level 7, while
  `lex_div/word_freq = 0.00158` → level 1). That is ~6 orders of magnitude
  beyond float32 rounding (~1.2e-7), so these are real mismatches, in both
  directions.
- Every live-mismatched row is also mismatched in the legacy snapshot →
  the divergence predates the Supabase migration (SPEC-039/061).
- The formula has never changed in git history and the only writer
  (`generate_update_sql`) sets all three columns in one UPDATE, so the
  current code cannot produce these rows. They are legacy partial-update
  artifacts (columns written at different times / by older runs), and 3,844
  rows that were mismatched in the snapshot were re-scored to consistency
  since.

**Impact:** for those videos the level badge is computed from a stale
`difficulty` and can be off by several levels.

**Recommended remediation:** re-score the affected languages with the
current pipeline, then regenerate the profile. Detect them with:

```sql
SELECT count(*) FROM public.youtube_videos
WHERE l2 = 'zh'
  AND difficulty IS NOT NULL AND lex_div IS NOT NULL AND word_freq > 0
  AND abs(difficulty - lex_div/word_freq) > 0.01 * abs(difficulty);
```

## Dependencies: wordfreq + jieba

- jieba `>= 0.42` is required by `wordfreq` 3.0.3 for Chinese
  (`Requires-Dist: jieba (>=0.42); extra == "jieba"`), because `wordfreq`
  calls `jieba.Tokenizer`, an API only present in jieba 0.42+.
- `requirements.txt` lists `jieba` **unpinned** (and `wordfreq` unpinned),
  which is how environments drift.
- The local dev environment was found in a corrupted state: pip metadata
  (dist-info) says jieba 0.42.1 and its RECORD lists a 19,809-byte
  `__init__.py`, but the on-disk files are jieba 0.34 (13,200 bytes,
  `__version__ = '0.34'`). Result: Chinese `zipf_frequency()` crashes with
  `AttributeError: module 'jieba' has no attribute 'Tokenizer'`.
- Verified in an isolated venv with jieba 0.42.1: `zipf_frequency('的',
  'zh') = 7.79`, `jieba.Tokenizer` present, and `set_dictionary` +
  `jieba.posseg` (the APIs `lemmatize_chinese.py` uses, per ADR-0019) all
  work.

**Recommendation:** pin `jieba>=0.42.1` (and `wordfreq>=3`) in
`requirements.txt` and repair the envelope
(`pip install --force-reinstall jieba==0.42.1` — or reinstall
`wordfreq[jieba]`). Upgrading is safe for the server: the APIs in use are
stable across 0.34→0.42.1, and already-scored rows are untouched. Note that
jieba's segmentation changed slightly between versions, so a future
re-scoring pass may produce slightly different `lex_div`/`word_freq` for
re-scored videos than the current archive values.

## Key files

| File | Role |
|---|---|
| `zerotohero-python-server/utils_video_lemma.py` | Lemmatize, fold, zipf, lex_div, difficulty, level mapping, profile generation |
| `zerotohero-python-server/utils_nlp.py` | `mtld_from_lemmas`, lemmatizer registry |
| `zerotohero-python-server/utils_language.py` | `DIFFICULTY_PROFILE` (single source of truth) |
| `zerotohero-python-server/level_mapping.py` | `LEVELS` exam mapping |
| `zerotohero-python-server/routes/core.py` | `GET /difficulty-profiles` |
| `zerotohero-python-server/data/difficulty_profile/` | Per-language difficulty dumps + aggregate profile |
| `packages/shared/src/constants.ts` | `getLevelFromDifficulty` |
| `apps/web/src/hooks/use-difficulty-profile.ts` | Fetches `/difficulty-profiles`, cache + dedupe |
| `zerotohero-nuxt/lib/utils/language-levels.js` | Classic ancestor (reference only) |

## Notes

- Runbook: `lemmatize_all_videos(lang)` then
  `add_lex_div_and_word_freq_to_all_videos(lang)`, then
  `create_difficulty_profile_csv()` and a regenerated `DIFFICULTY_PROFILE`.
- The shipped `zh` profile dates from `8ba2c17` (2023-10-16); a 2024-05-17
  experiment (`8a853f3`, growth_factor=2.5 values) was reverted
  (`ff07ada`), leaving the `8ba2c17` values. The underlying difficulty
  distribution has grown since (the snapshot on disk has 149,298 zh rows vs
  121,834 in the live table), so after any re-scoring campaign the profile
  should be regenerated against the new distribution.
- `video.level` (the string column in `youtube_videos`) is unrelated to the
  difficulty badge; it is a legacy/curated field.
