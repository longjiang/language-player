# CJK Glyph Rendering

## Metadata
- **Spec ID**: SPEC-088
- **Feature**: Correct CJK glyph-variant rendering while keeping uniform ruby line spacing (mobile)
- **Status**: draft — as-built solution recorded
- **Created**: 2026-08-24
- **ROADMAP Phase**: Cross-cutting (mobile rendering)
- **Scope**: `apps/mobile` tokenized text (`TokenizedText`, the native ruby paragraph)
- **See also**: [SPEC-087 — Paginated Reader](087-paginated-reader.md) · [ARCH-030 — Native Ruby Text Rendering](../arch/030-ruby-text-native-rendering.md) · [ADR-0038 — Native Ruby Text Rendering](../adr/0038-native-ruby-text-rendering.md)

## Overview

CJK text is ambiguous: the same Unicode code point has **different visual forms** depending on the language — simplified Chinese vs traditional Chinese vs Japanese kanji vs Korean-hanzi. A single hanzi like `门`/`門`, `将`/`將`, `风`/`風`, and the forms of `骨`/`直`/`足`/`言`/`道`/`神`/`空`/`花`/`草`/`竹`/`雨`/`福`/`米` differ across scripts. iOS's system font (SF) has **no CJK glyphs** — it substitutes on demand, and the substituted font is chosen **per the text's language**. This spec records the problem and the solution, which keeps the system font's uniform line metrics while rendering the correct glyph variants per language.

## The problem

Two requirements collided:

1. **Uniform line spacing across languages (SPEC-087 §5).** The ruby line pitch must be identical for every script. Forcing a per-script glyph font to get correct CJK glyphs — e.g. Hiragino Sans for Japanese — made Japanese **line pitch grow** (45px vs the 39px pin at 16px text), because Hiragino's own line metrics are larger than the shared pin. So correct glyphs (script font) broke uniform spacing.

2. **Correct glyph variants.** Using the system font uniformly gave tight, consistent line metrics, but the system font has no CJK glyphs and falls back **per language**. Japanese text carries kana (an unambiguous cue) so it fell back to Hiragino correctly; **pure-hanzi Chinese has no cue**, so the system font picked a generic/wrong CJK font and rendered simplified-Chinese glyphs as the wrong (Japanese/traditional) forms — observed as `门`/`将`/`风` looking wrong in the simplified-Chinese sample while `日本語` looked fine.

The previous fix for correct glyphs (commit `1c19f27c`, forcing a per-language glyph font via `glyphFontFamily`) solved #2 but reintroduced #1. The tokenizer-test CJK glyph poem made the relationship visible: with the script font the line pitch was ja 45px vs zh 37px; with the system font the pitch was uniform but zh glyphs were wrong.

## The solution

Decouple the two by using a **system font base + language tag**:

1. **Base text uses the system font.** `TokenizedText` no longer forces a per-script glyph font (`glyphFontFamily` is unused). The system font's tight, uniform metrics keep the line pitch identical for every script and language (the engine's per-line pitch lands on the shared pin).

2. **Every run is tagged with its L2 language.** The base and reading runs carry the BCP-47 language attribute (`kCTLanguageAttributeName` / `NSLanguage`), e.g. `ja`, `zh-Hans`, `zh-Hant`, `ko`. Core Text's font fallback then picks the **correct script font** for those characters — Hiragino Sans for `ja`, PingFang SC for `zh-Hans`, PingFang HK/TC for `zh-Hant`, Apple SD Gothic Neo for `ko` — which renders the **correct glyph variant**. The L2 code is already resolved to these tags (`glyphLang`) for the RN `<Text lang>`.

3. **Readings are tagged too.** The furigana/kana reading runs (via `CTRubyAnnotation`) get the same language tag so kana/diacritics render in the right script.

The result: line spacing comes from the system font (uniform), glyph shapes come from the language-tagged fallback font (correct variants), and the language tag bridges the two. This preserves the earlier "language-specific glyph rendering" behavior — it just moves it from *forcing a font* to *tagging the language*.

## How it works on iOS

- `UIFont.systemFont` reports the same tight line height for every script; CJK glyphs are substituted by Core Text during layout using the run's language.
- The language attribute (`kCTLanguageAttributeName` as an `NSAttributedString.Key`) guides that substitution to the right font family and the correct regional variants.
- This is why the base font, not the reading font, controls the line pitch: switching the ruby font changed tracking by a couple percent but not the pitch; switching the base font to the system font did.

## Files

- `apps/mobile/components/TokenizedText.tsx` — base font = system (no `glyphFontFamily`); passes the resolved L2 `glyphLang` as the paragraph `language`.
- `apps/mobile/modules/ruby-text/ios/RubyTextParagraphView.swift` — sets `kCTLanguageAttributeName` on each base run and on the ruby annotation's reading attributes.
- `apps/mobile/modules/ruby-text/ios/RubyTextModule.swift`, `modules/ruby-text/src/index.ts` — the `language` prop.
- `apps/mobile/components/RubyText.tsx`, `tokenized-text-spans.tsx` — plumb the language to the native view.
- `packages/shared/src/sample-content/{zh,ja,yue}.ts` — the CJK glyph test poem (门/将/骨/直/足/今/言/道/神/空/青/花/草/竹/雨/风/近/首/高/福/米/羽 …) rendered in simplified (zh), Japanese kanji (ja), and traditional (yue).

## Verification (tokenizer test)

Set the tokenizer-test cards to the system base (the now-permanent default) and scroll the CJK sample poem:

- **中文 (zh-Hans):** `门`/`将`/`风` render as simplified forms; line pitch matches the others.
- **日本語 (ja):** `門`/`将`/`風` render as Japanese kanji; line pitch matches.
- **廣東話 (yue / zh-Hant):** `門`/`將`/`風` render as traditional forms.
- **한국어 (ko):** renders correctly (Apple SD Gothic Neo).
- Line pitch is identical (e.g. ~37px at 16px/1.625 leading, all on the shared pin) across all scripts.

## Acceptance criteria

- Every CJK glyph renders in the correct variant for its L2 language with the system base font (no wrong Japanese/traditional forms in simplified Chinese, and vice versa).
- The ruby line pitch is uniform across all languages and scripts.
- Readings render in the correct script.
