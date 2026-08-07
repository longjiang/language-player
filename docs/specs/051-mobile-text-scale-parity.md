# SPEC-051 — Mobile Text-Scale Parity with Web

## Metadata

- **Spec ID**: SPEC-051
- **Feature**: Bring `apps/mobile` tokenized-text scaling in line with `apps/web`
- **Status**: complete
- **Created**: 2026-08-07
- **ROADMAP Phase**: Phase 6 (Interaction Primitives) / Phase 8 (iPad & Responsive Layout)
- **Scope**: `apps/mobile` only
- **Related specs**: [SPEC-050 — Mobile Sidebar & Video Layout Parity](050-mobile-sidebar-video-parity.md)

---

## Overview

Apps/web resolves the user's text-size setting (zoom index 0–7) through a
`textScale` prop on `TokenizedText`:

- `textScale` omitted → user zoom alone
- `textScale` provided → `textScale × user zoom`
- `textScale={0}` → inherit; no inline font size (parent controls size)

The zoom indexes map to `[1, 1.125, 1.25, 1.375, 1.5, 1.75, 2, 2.25]`.

Apps/mobile currently applies one hardcoded formula (`16 + zoom * 2`) to every
`TokenizedText` instance, with no per-surface override and a different size
curve. This spec brings mobile in line with web.

---

## Target behavior

| Surface | Web `textScale` | Mobile after |
|---|---|---|
| Settings preview | omitted (zoom) | omitted (zoom) |
| Tokenizer debug | `1` | `1` |
| Corpus examples / collocations / mistakes | `1` | `1` |
| Subtitle transcript rows | `1` | `1` |
| Single-line subtitles | `1.5` | `1.5` |
| Notes / web reader blocks | `0` (inherit) | `0` (fixed 16px) |
| EPUB reader blocks | `0` + container zoom | `1` (equivalent to container zoom) |
| AI explanation | `0` | `0` |
| Text-action menu preview | `0` | `0` |
| Review | omitted (zoom) | omitted (zoom) |

The mobile zoom→px mapping must match web: `ZOOM_TO_REM[index] × 16`.

---

## Implementation plan

1. Add `apps/mobile/lib/text-scale.ts` with the shared `ZOOM_TO_REM` array.
2. Add a `textScale?: number` prop to mobile `TokenizedText` and resolve the
   effective font size using the same rules as web.
3. Apply per-surface `textScale` values at every `TokenizedText` call site.
4. Add a `textScale` prop to `PaginatedReader` and pass it through to table
   cells, body blocks, and measuring blocks.
5. Pass `textScale={1}` from the EPUB screen; notes/web readers default to `0`.
6. Typecheck and verify the settings preview still updates the rendered size.

---

## Acceptance criteria

- `TokenizedText` supports `textScale` with web-compatible semantics.
- Zoom index 0–7 renders the same sizes as web (`16px`–`36px`).
- AI explanation and action-menu previews do not scale with the user zoom.
- Corpus and tokenizer text scale with the user zoom.
- Single-line subtitles render at 1.5× the user zoom.
- Readers match web: notes/web reader blocks are fixed-size; EPUB blocks scale.
