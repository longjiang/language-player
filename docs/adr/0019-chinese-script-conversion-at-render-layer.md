# ADR-0019 — Chinese Script Conversion at Render Layer

**Date**: 2026-07-26
**Status**: Accepted (amended 2026-09-01: presets corrected from `twp`↔`cn`
to script-level `t`↔`cn` — see § Amendment: script-level presets, not
TW-locale presets)

## Context

The web app currently converts Chinese script (Simplified ↔ Traditional) **before tokenization** — in `TokenizedText` and the reader page. When a user sets `display.traditional = true`, OpenCC (`cn → twp`) converts the raw text first, then the converted text is sent to the lemmatizer (`POST /lemmatize-normalized`) and subsequently to the dictionary lookup (`POST /dictionary/lookup-batch`).

This has two negative consequences:

1. **Jieba quality degradation for traditional learners**: Jieba's default dictionary (`dict.txt`) is optimized for Simplified Chinese. Traditional learners always send traditional text to a simp-optimized tokenizer, resulting in potentially worse segmentation (e.g., traditional-specific compounds like 那麼, 爲什麼 may get over-segmented because they have lower frequency in the default dictionary).

2. **Video token cache fragmentation**: The video token cache (`GET /lemmatize-video-normalized`) is keyed by `MD5(original text)`. Since TokenizedText sends the *converted* text, the same subtitle line produces two different cache entries depending on the learner's script preference — doubling server-side cache storage and preventing cache sharing between simplified and traditional learners watching the same content.

Additionally, `TokenSpan` is already the component responsible for per-token rendering decisions — it reads the dictionary cache directly (`getCachedEntries`), determines word difficulty (`getWordDifficulty`), and renders script variants like Korean hanja / Vietnamese hán tự (`byeonggiText`). Chinese script conversion is the same class of problem but currently happens at the wrong layer.

## Decision

### 1. Move script conversion to TokenSpan (render layer)

Chinese script conversion moves from `TokenizedText` (pre-tokenization) to `TokenSpan` (per-token rendering). `TokenizedText` always tokenizes the **original** text. `TokenSpan` reads `display.traditional` from `useSettingsContext()` and applies OpenCC per-token when the user's preference differs from the token's actual script.

**Before:**
```
text → [OpenCC] → POST /lemmatize-normalized → tokens → TokenSpan (no conversion)
```

**After:**
```
text → POST /lemmatize-normalized → tokens → TokenSpan (OpenCC per-token if needed)
```

### 2. Load `dict.txt.big` on the server

The Python backend loads Jieba's larger dictionary (`dict.txt.big`) via `jieba.set_dictionary('dict.txt.big')` at startup. This gives Jieba equal-quality segmentation for both simplified and traditional Chinese text, eliminating the quality gap for traditional learners.

This is a complementary improvement to Decision 1 — even after moving conversion to the render layer, the lemmatizer still needs to handle traditional text well because:
- Simplified learners viewing traditional source content send traditional text to the lemmatizer
- The video token cache (`/lemmatize-video-normalized`) tokenizes the original script, which may be traditional

### TokenSpan Implementation Pattern

TokenSpan already has the exact pattern for this. `byeonggiText` (lines 119–135 of `token-span.tsx`) reads the dictionary cache, extracts a script variant, and renders it. Chinese script conversion follows the same pattern:

```tsx
// Inside TokenSpan — same pattern as byeonggiText
const { getL2 } = useSettingsContext();
const l2Settings = getL2(l2Code);
const useTraditional = base === 'zh' && l2Settings.display.traditional;

// Convert token.text and lemma.lemma per-token when needed
const displayText = useMemo(() => {
  if (!useTraditional) return token.text;
  // OpenCC cn→twp, lazily loaded, idempotent on already-traditional
  // ... async conversion with cacheVersion re-render pattern
}, [token.text, useTraditional, cacheVersion]);
```

**No new props needed.** TokenSpan already reaches into `useSettingsContext()` (indirectly via `getCachedEntries`), and `cacheVersion` already handles the async-population re-render case.

### What Gets Removed

1. `TokenizedText`: The entire `convertedText` state, `converting` state, and the OpenCC `useEffect` (lines 127–152). The `effectiveText` variable becomes just `text`.
2. Reader page (`apps/web/src/app/[l1]/[l2]/reader/page.tsx`): The `convertedText` state and its `useEffect` (lines 214–219). Blocks are parsed from the original `text` instead. `TokenizedText` in the reader receives original text and handles script display internally.

### What Gets Added

1. `TokenSpan`: Reads `display.traditional` from settings, lazy-loads OpenCC, converts `token.text` and `lemma.lemma` per-token when the script differs from user preference.
2. Python server (`lemmatize_chinese.py` or startup): `jieba.set_dictionary('dict.txt.big')` to load the larger dictionary with better traditional coverage.

## Consequences

### Positive

- **Better tokenization for all users**: Tokenizing the original text means Jieba always segments the script it was trained on (mostly simplified, but `dict.txt.big` gives equal traditional quality). No learner is penalized for their script preference.
- **Unified video token cache**: One cache entry per subtitle line regardless of learner's script preference. Simplified and traditional learners watching the same video share the same cache.
- **Consistent architecture**: Chinese script conversion joins Korean hanja and Vietnamese hán tự as per-token rendering concerns in `TokenSpan`. All script variants are handled in one place, one pattern.
- **Simpler TokenizedText**: Removes ~25 lines of conversion state management. The container does one thing: tokenize.
- **Mobile ready**: The mobile `TokenizedText` doesn't need to know about Chinese script conversion at all. When `TokenSpan` is ported to mobile (or the mobile equivalent), it reads the same setting and applies the same conversion.

### Negative

- **OpenCC loaded per-token, not per-text**: Instead of one OpenCC call for the entire text, each Chinese character token triggers conversion. In practice this is negligible — OpenCC `cn→twp` is a character-level mapping, and the lazy-loaded module stays in memory. The per-token calls are essentially dictionary lookups.
- **TokenSpan becomes heavier**: TokenSpan already reads settings, dictionary cache, and computes word difficulty. Adding script conversion is incremental complexity, not a new architectural concept.
- **`dict.txt.big` increases server memory**: The larger dictionary uses more RAM (~2× the default). This is acceptable — the server already loads MeCab for Japanese and spaCy for Croatian, both of which have comparable memory footprints.

## Affected Files

| File | Change |
|---|---|
| `apps/web/src/components/tokenized-text.tsx` | Remove `convertedText`/`converting` state and OpenCC `useEffect` |
| `apps/web/src/components/token-span.tsx` | Add `display.traditional` via settings, per-token OpenCC conversion |
| `apps/web/src/app/[l1]/[l2]/reader/page.tsx` | Remove `convertedText` state and its `useEffect`; parse original `text` |
| `zerotohero-python-server/lemmatize_chinese.py` | Add `jieba.set_dictionary('dict.txt.big')` |
| `docs/arch/017-tokenization-batch-lookup-pipeline.md` | Update Traditional Chinese Conversion section |

## References

- [ARCH-017: Tokenization & Batch Lookup Pipeline](../arch/017-tokenization-batch-lookup-pipeline.md) — full pipeline documentation
- [Jieba README: Other Dictionaries](https://github.com/fxsjy/jieba#%E5%85%B6%E4%BB%96%E8%AF%8D%E5%85%B8) — `dict.txt.big` for better traditional support
- `apps/web/src/lib/chinese-script.ts` — OpenCC wrapper (reused by TokenSpan)
- `apps/web/src/components/token-span.tsx:119-135` — `byeonggiText` pattern (same as script conversion)

## Amendment: script-level presets, not TW-locale presets (2026-09-01)

The original implementation used opencc-js's TW-locale presets
(`cn → twp`, `twp → cn`). Those presets run **phrase normalization before
script conversion**, which breaks the idempotency this ADR relies on:

- The `twp` normalization table (`TWVariantsRev`) maps the standalone /
  word-final particle 么 to the TW dictionary form 幺 **before**
  simplification. Verified in opencc-js 1.4.1: `twp→cn` converts
  什么 → 什幺, 这么 → 这幺, 为什么 → 为幺, 么 → 幺 — corrupting
  already-simplified input (the common case: mainland subtitles with a
  learner who prefers simplified). A full scan of CJK codepoints
  U+3400–9FFF + U+F900–FAFF found no other simplified→simplified
  corruption; the only other remap is 苧 → 苎 (a benign variant
  normalization of a rare character).
- Locale presets also localize **vocabulary**: 滑鼠 → 鼠标,
  軟體 → 软件, 影片 → 视频. That silently replaces the word actually
  spoken in the audio, which harms comprehension.

**Decision (amendment):** use the script-level presets `cn ↔ t` in
`apps/web/src/lib/chinese-script.ts` and
`apps/mobile/lib/chinese-script.ts`. They convert glyphs only, are
idempotent in both directions (verified over all CJK codepoints), and
match the Classic app's `chinese-conv` behavior (滑鼠 stays 滑鼠,
什么 stays 什么). The original claim below — "OpenCC cn→twp is
idempotent on already-traditional text" — was true for `cn→twp` but not
for the reverse direction under the locale presets; the generic `t`
presets restore it for both.
