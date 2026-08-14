# SPEC-051 — Mobile Text-Scale Parity with Web

## Metadata

- **Spec ID**: SPEC-051
- **Feature**: One text-scale rule shared by `apps/mobile` and `apps/web`
- **Status**: in progress
- **Created**: 2026-08-07
- **Updated**: 2026-08-13
- **ROADMAP Phase**: Phase 6 (Interaction Primitives) / Phase 8 (iPad & Responsive Layout)
- **Scope**: `apps/mobile` + `apps/web`
- **Related specs**: [SPEC-050 — Mobile Sidebar & Video Layout Parity](050-mobile-sidebar-video-parity.md)

---

## Overview

Both apps share one text-scale rule. There is no per-surface table of
multipliers anymore; the only special case is single-line subtitles.

The user's text-size setting is a zoom index 0–7 mapping to
`[1, 1.125, 1.25, 1.375, 1.5, 1.75, 2, 2.25]` (rem multipliers).
`ZOOM_TO_REM[index] × 16` gives the px size: 16px at zoom 0 up to 36px at
zoom 7.

---

## Target behavior — one rule

1. **Block-level `TokenizedText` always renders at the user's zoom.** Default
   multiplier is `1` (× user zoom). Single-line subtitles are the only
   exception at `1.5` (× user zoom). No other surface gets a different
   multiplier.
2. **Scaling and leading apply only to block-level tokenized text.** Inline
   tokenized text (e.g. AI explanation code spans embedded in a markdown
   paragraph) inherits the surrounding font size and line height; zoom and
   leading do not apply.
3. **Reader headings scale by multiplying their natural size by the zoom
   factor**, preserving the hierarchy (h1 24px, h2 20px, h3 18px, h4+ 16px at
   zoom 0). They are not forced down to the 16px body size.
4. **Translations use the same multiplier as the adjacent tokenized text**
   (1.5 for single-line subtitle translations, 1 everywhere else), applied to
   the translation's own base font size. Web's current behavior is the
   reference.
5. **Default line height for block-level `TokenizedText` is `relaxed`
   (1.625×)**. Inline tokenized text inherits the parent's line height.
6. **Mobile keeps OS font scaling (dynamic type) enabled.** It is additive on
   top of the in-app zoom; web has no OS equivalent.

Block-level surfaces include: settings preview, tokenizer debug, corpus
examples / collocations / mistakes, subtitle transcript rows, single-line
subtitles, notes / web / EPUB reader blocks, text-action menu previews, and
review.

Inline surfaces include: AI explanation code spans inside markdown.

The `textScale={0}` / inherit mode is removed. A `textScale` multiplier (or
equivalent) remains only for the single-line subtitle case.

---

## Implementation plan

1. Keep the shared `ZOOM_TO_REM` arrays and `useTextScale()` in both apps.
2. Block-level `TokenizedText` always applies the user zoom; single-line
   subtitles pass `1.5`. Inline tokenized text (AI explanation) renders without
   zoom or leading.
3. Readers: multiply heading natural sizes by zoom on both web and mobile.
   Translations scale with the same multiplier as adjacent tokenized text on
   mobile (web already does).
4. Corpus mistakes: mobile renders with `TokenizedText` at `1`× zoom, matching
   web.
5. `TokenizedText` defaults to `relaxed` (1.625×) leading on both web and
   mobile.
6. Typecheck and verify: settings preview, single-line subtitles, transcript
   rows, readers (headings + translations), corpus, AI explanation, and review.

---

## Acceptance criteria

- Only two multipliers exist: `1` (default) and `1.5` (single-line subtitles).
- Block-level `TokenizedText` renders 16px–36px following
  `ZOOM_TO_REM[index] × 16`.
- Inline tokenized text (AI explanation) does not scale with zoom and does not
  apply leading.
- Single-line subtitles render at 1.5× the user zoom; transcript rows at 1×.
- Reader headings keep their natural hierarchy and scale with zoom.
- Translations scale by the same multiplier as their adjacent tokenized text.
- Mobile corpus mistakes render through `TokenizedText` at 1× zoom, matching
  web.
- Block-level default line height is `relaxed` (1.625×); inline text inherits
  the parent's.
- Mobile OS font scaling remains enabled.

---

## Known issues (deferred)

Web furigana (`<rt>`) rendering differs between Chrome and Safari: Safari's
annotation box is ~14px tall with ~2px of extra space above the reading,
while Chrome's is ~13px and sits tighter against the base text (observed at
an 11px reading size). Neither pinning `line-height` on `rt` nor pinning an
explicit CJK font stack changed the rendering in either browser, so the
cause appears to be engine-level ruby annotation layout — Inter has no
kana/kanji glyphs, so each browser falls back to a different CJK font.
Deferred; revisit with a custom ruby layout on web (like mobile) or
browser-targeted margins.
