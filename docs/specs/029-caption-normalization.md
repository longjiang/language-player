# Caption Normalization (LLM cleanup of auto-generated captions)

## Metadata
- **Spec ID**: SPEC-029
- **Feature**: LLM normalization of auto-generated (ASR) captions
- **Status**: in-progress
- **Created**: 2026-08-01
- **ROADMAP Phase**: Backend caption pipeline

## Overview

Auto-generated YouTube captions often arrive without punctuation or
capitalization and contain misheard words. When the Flask backend serves an
auto-generated transcript (`is_generated=True`), it can send the caption text
to an LLM that rewrites each line in place -- adding punctuation, fixing
capitalization, and correcting clear mishears -- while preserving one output
line per input line. The cleaned lines are then swapped back onto the
original timestamps, so users see cleaner, more accurate subtitles.

The **web app** (Next.js) uses a **progressive client-side mode**: it loads
the raw auto-generated captions instantly, then normalizes them lazily in
40-line chunks near the playhead and swaps each cleaned chunk into the UI as
it arrives. The server-side full-transcript mode (below) remains the default
for other clients (Classic app, mobile, direct API calls).

## Behavior

- Normalization runs only for **auto-generated** transcripts
  (`is_generated=True`) fetched in their **original language** (`tlangs=None`).
  Machine-translated L1 transcripts are never normalized.
- The LLM must return **exactly one line per input line, in order**. The
  server verifies the count and falls back to the original lines on any
  mismatch, LLM error, or empty-line replacement.
- **Progressive (web) mode**: the client first fetches raw captions
  (`clean_generated=0`), then requests one 40-line slice at a time from
  `/timedtext/clean`. Only the chunk the playhead is in plus **one chunk of
  lookahead** is ever cleaned; the rest stay raw until the playhead nears
  them. Cleaned slices are swapped onto the same timestamps in the transcript
  and the subtitles-mode band.
- **Full (server) mode**: `caption()` normalizes the whole transcript before
  responding (used by non-web clients). Chunking, verification, and caching
  are shared with progressive mode.
- The prompt is language-aware: for continuous scripts (zh, ja, th, lo, km,
  my) the model is told there is no capitalization and it must not add or
  remove spaces between characters.
- The cleaned text is deliberately conservative: no paraphrasing, no
  contraction expansion, no tone changes -- so cleaned lines still match the
  spoken audio and the dictionary tokenizer.

Progressive mode keeps the first paint fast: a 30-minute ASR transcript never
blocks on the full LLM cleanup, and lines the user never watches (far ahead in
the video) are never normalized at all.

## Prompt (v10)

- `PROMPT_VERSION` in `app_caption_normalizer.py` tags cached output; bump it
  whenever the prompt text changes so old clean-cache entries are ignored.
- Six language-agnostic rules: add missing punctuation (fragments and
  multi-sentence lines allowed), no translation, fix clear mishears, add
  obviously missing words in brackets so sentences are grammatical, exactly
  one `[n]` line per input line, and numbered output only.
- No language-specific appendices (no-spaces rule for continuous scripts,
  sentence-end hints, or mishear examples) are currently appended.
- YouTube's "(auto-generated)" suffix on language names (e.g. "Japanese
  (auto-generated)") is stripped before building the prompt.

## Configuration

- `CLEAN_GENERATED_CAPTIONS` env var controls the master switch
  (`1` default, `0` disables). Per-call override is available through the
  `clean_generated` parameter on `caption()` and as a `clean_generated` query
  parameter on `/timedtext`, `/videos`, and `/videos/subtitles`; the web app
  forwards it through the Next.js routes `/api/videos/[videoId]` and
  `/api/videos/[videoId]/subtitles`. `/timedtext/clean` always fetches raw and
  normalizes only the requested slice -- it has no `clean_generated`
  parameter. Query args are parsed with `_parse_bool_arg()` so
  `clean_generated=0`/`false` genuinely disable normalization (Flask's
  built-in bool converter treats those strings as truthy).

## Progressive Flow (web)

1. `apps/web` fetches the video via `/api/videos/[videoId]` (or
   `/api/videos/[videoId]/subtitles`), always passing `clean_generated=0` so
   the first load returns **raw** ASR lines instantly. The response includes
   `isGenerated` so the client knows whether normalization applies.
2. `useCaptionNormalization()` (apps/web/src/hooks/) watches the playhead and
   requests `/timedtext/clean?v=...&l2=...&start=N&end=N+40` for the visible
   chunk plus one chunk ahead. Chunks behind or far ahead are never fetched.
3. The Flask endpoint resolves the best L2 transcript (same logic as
   `/get_best_l2_subs`), fetches it raw (cached under `clean=0`), and calls
   `normalize_lines_range()` on only that slice -- with the raw line before
   the slice as context so boundaries stay coherent.
4. Each response `{start, end, lines}` is mapped back onto the original
   line indices and swapped into the transcript and the subtitles band.
   Already-cleaned chunks are preserved; a failed chunk simply keeps showing
   the raw line and auto-retries after a 30s cooldown (or via retry()).

Every cleaned 40-line chunk is cached server-side (keyed by prompt version +
boundary context + chunk lines), so seeking back, replaying, or another
session reusing the same chunk never re-pays the LLM. A later full-transcript
normalization reuses the same per-chunk cache entries.

## Data Flow

The full server mode; the progressive web flow is described above.

1. `app_youtubecaptions.caption()` fetches a transcript and calls
   `fetched.to_raw_data()` → `[{text, start, duration}, ...]`.
2. If `fetched.is_generated` and no translation was requested, the `text`
   values are passed to `app_caption_normalizer.normalize_lines()`.
3. `normalize_lines()` (full mode) or `normalize_lines_range()` (progressive
   mode) checks `cache/caption_clean/{language_code}/` per chunk (keyed by the
   prompt version + boundary context lines + md5 of the joined chunk lines, so
   prompt changes invalidate old results and partial runs share the same
   entries); on a miss it chunks (40 lines), prompts DeepSeek with numbered
   lines, parses and verifies the response, and caches the result. Failed
   chunks are NOT cached, so transient LLM errors retry cleanly.
4. Cleaned texts are zipped back onto the same `start`/`duration` values and
   stored in the normal caption cache, so subsequent fetches never re-pay the
   LLM cost.

## Files

- `zerotohero-python-server/app_caption_normalizer.py` -- prompt building,
  chunking, per-chunk caching, parsing, verification, fallback;
  `normalize_lines_range()` for progressive slices
- `zerotohero-python-server/app_youtubecaptions.py` -- integration point
  (`caption()`), `CLEAN_GENERATED_CAPTIONS` flag, and
  `get_best_l2_subs_with_meta()` (subs + transcript metadata)
- `zerotohero-python-server/utils_cache.py` -- caption cache key includes
  the clean flag; `cache/caption_clean/` helpers
- `zerotohero-python-server/routes/core.py` -- `/timedtext` accepts
  `clean_generated`; new `/timedtext/clean` progressive slice endpoint;
  `_parse_bool_arg()` bool parsing
- `zerotohero-python-server/routes/video.py` -- `/videos` and
  `/videos/subtitles` accept `clean_generated` and return `isGenerated`
- `apps/web/src/hooks/use-caption-normalization.ts` -- client-side lazy
  normalization loop (40-line chunks, visible + 1 lookahead, sparse overlay)
- `apps/web/src/components/video/subtitle-display.tsx` -- applies the cleaned
  overlay; self-fetches raw + normalizes when no parent overlay is provided
- `apps/web/src/app/[l1]/[l2]/watch/[videoId]/page.tsx` -- page-level
  normalization shared by the transcript and the subtitles-mode band
- `apps/web/src/app/api/videos/[videoId]/route.ts` and `.../subtitles/route.ts`
  -- raw-first fetches (`clean_generated=0`) + `isGenerated` passthrough

## Dependencies

- DeepSeek via `app_chatgpt.ask_with_cache()` (same model/pipeline as
  translation)

## Open Questions

- Whether to surface a per-user toggle in the UI (currently server-global).
- Whether misheard-word correction should be stricter or looser per language.
