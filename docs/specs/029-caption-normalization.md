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
original timestamps, so users see cleaner, more accurate subtitles without any
client-side changes.

## Behavior

- Normalization runs only for **auto-generated** transcripts
  (`is_generated=True`) fetched in their **original language** (`tlangs=None`).
  Machine-translated L1 transcripts are never normalized.
- The LLM must return **exactly one line per input line, in order**. The
  server verifies the count and falls back to the original lines on any
  mismatch, LLM error, or empty-line replacement.
- The prompt is language-aware: for continuous scripts (zh, ja, th, lo, km,
  my) the model is told there is no capitalization and it must not add or
  remove spaces between characters.
- The cleaned text is deliberately conservative: no paraphrasing, no
  contraction expansion, no tone changes -- so cleaned lines still match the
  spoken audio and the dictionary tokenizer.

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
  `clean_generated` parameter on `caption()` and the `clean_generated` query
  parameter on `/timedtext`.

## Data Flow

1. `app_youtubecaptions.caption()` fetches a transcript and calls
   `fetched.to_raw_data()` → `[{text, start, duration}, ...]`.
2. If `fetched.is_generated` and no translation was requested, the `text`
   values are passed to `app_caption_normalizer.normalize_lines()`.
3. `normalize_lines()` checks `cache/caption_clean/{language_code}/` (keyed by
   the prompt version + md5 of the joined original lines, so prompt changes
   invalidate old results); on a miss it chunks (>40 lines), prompts DeepSeek
   with numbered lines, parses and verifies the response, and caches the result.
4. Cleaned texts are zipped back onto the same `start`/`duration` values and
   stored in the normal caption cache, so subsequent fetches never re-pay the
   LLM cost.

## Files

- `zerotohero-python-server/app_caption_normalizer.py` -- prompt building,
  chunking, parsing, verification, fallback
- `zerotohero-python-server/app_youtubecaptions.py` -- integration point
  (`caption()`) and `CLEAN_GENERATED_CAPTIONS` flag
- `zerotohero-python-server/utils_cache.py` -- caption cache key now includes
  the clean flag; new `cache/caption_clean/` helpers
- `zerotohero-python-server/routes/core.py` -- `/timedtext` accepts
  `clean_generated`

## Dependencies

- DeepSeek via `app_chatgpt.ask_with_cache()` (same model/pipeline as
  translation)

## Open Questions

- Whether to surface a per-user toggle in the UI (currently server-global).
- Whether misheard-word correction should be stricter or looser per language.
