# SPEC-114 — Subs-Search Result Rows Render Tokenized Text (Display-Only)

## Metadata

- **Spec ID**: SPEC-114
- **Feature**: Dictionary "Examples from Videos" result rows render their L2 line through `TokenizedText` in a display-only mode, so Chinese simplified↔traditional follows the learner's script preference and phonetics follow their display settings
- **Status**: complete (web + mobile, 2026-11-26)
- **Created**: 2026-11-26
- **ROADMAP Phase**: Phase 4 — Dictionary
- **Governing decisions**: [ADR-0019](../adr/0019-chinese-script-conversion-at-render-layer.md) (script conversion at the render layer), [ADR-0039](../adr/0039-flat-ruby-run-web.md) (flat ruby run)
- **Related specs**: [SPEC-051](051-mobile-text-scale-parity.md) (text size — the row follows the block-level rule), [SPEC-082](082-mobile-web-parity-reader-subs-sync.md) Task 7/16 (one matched line per row, longest-term highlight), [SPEC-093](093-video-subtitle-notes.md) (`[n]` note badges), [SPEC-109](109-subs-search-forms-filter.md) (which forms the list highlights)
- **As-built**: [ARCH-036](../arch/036-subs-search-architecture.md) § "Result row rendering"
- **Files**:
  - `apps/web/src/components/video/subs-search-row.tsx` (+ `subs-search-row.test.tsx`)
  - `apps/mobile/components/video/SubsSearchRow.tsx`

## Overview

The subs-search result list (dictionary entry → **Examples from Videos**, and the
"Examples from Videos" chips inside a DeepSeek explanation) rendered the matched
subtitle line as **plain text** with a substring `<mark>` for the search term.

Because of that, the row bypassed `TokenizedText` entirely — and therefore bypassed
everything `TokenizedText` owns at the render layer:

- **Chinese script preference** (ADR-0019). A learner with
  `display.traditional = true` reading a Simplified source saw Simplified text in
  every result row while the dictionary headword above it rendered Traditional.
  The row was the only reading surface in the dictionary that ignored the setting.
- **Phonetics.** No pinyin / furigana / reading appeared in rows even when
  `tokenSpan.phonetics` asked for it everywhere else.

This spec makes the row render through `TokenizedText` — but as a **preview**, not
an interactive reading surface. Three properties keep it a preview:

1. **Not interactive.** The tokenized span is wrapped in `pointer-events-none`
   (web) / `pointerEvents="none"` (mobile). Tokens never receive a click, so no
   dictionary popup opens and the tap falls through to the row itself, which opens
   playback. There is no per-token cursor, hover highlight, or selection affordance.
2. **No saved-word highlighting.** `highlightSaved={false}`. Because the quick
   gloss only renders for saved tokens, this also suppresses quick glosses — a row
   never shows "(def)" annotations.
3. **No interlinear definitions.** `showDefinition={false}`, so a row is one line
   of L2 text plus its phonetic ruby, never a stack of per-word glosses.

Text size is **not** exempted: per [SPEC-051](051-mobile-text-scale-parity.md) §
Target behavior 1, block-level `TokenizedText` always renders at the user's zoom, so
a row's L2 line grows with the text-size setting (16px–36px) exactly like every other
tokenized surface. The row's thumbnail and translation line keep their own sizes.

## What stays the same

- One matched line per row, no previous/next context (SPEC-082 Task 7).
- The search term is still highlighted, with the same look as before — now via
  `highlightForms` / `highlightTerms` (token-level `HIGHLIGHT_CLASS`), which also
  handles a term that sits inside a larger token (e.g. 武侠 in 武侠片) and
  inflected forms whose lemma matches.
- The muted/normal treatment of a segment without a term (`textColor`).
- `[n]` note markers are still stripped from the line and drawn as badges
  (SPEC-093); in a row they are inert — the playback modal keeps them tappable.
- The translation line below (markdown, server-side `**term**` highlight),
  translation skeletons, and the click-to-play behaviour are unchanged.
- No change to the playback modal — it already renders `SubtitleDisplay` →
  `TokenizedText`, fully interactive.

## Rendering contract

| Concern | Web | Mobile |
|---|---|---|
| Component | `<TokenizedText>` | `<TokenizedText>` |
| Display-only | wrapper `<span className="pointer-events-none">` | wrapper `<View pointerEvents="none">` |
| Popup | `disablePopup` | `disablePopup` |
| Saved-word highlight | `highlightSaved={false}` | `highlightSaved={false}` |
| Interlinear definitions | `showDefinition={false}` | `showDefinition={false}` |
| Search-term highlight | `highlightForms={highlightTerms}` | `highlightTerms={highlightTerms}` |
| Note badges | `notes={video.notes}` | `notes={video.notes}` |
| Text size | block-level (zoom applies, SPEC-051) | block-level (zoom applies, SPEC-051) |
| L2 code | `useLanguage().l2.code` | `useLanguage().l2Lang.code` |

Applies to **every** L2, not just Chinese: phonetics appear only where the language is
phonetics-eligible and the setting is on, so a Latin-script row looks the same as
before while a Chinese/Japanese row gains readings.

## Non-goals

- Not changing the playback modal, the translation pipeline, the list's filters,
  sorting, grouping, or the forms filter (SPEC-109).
- Not converting the plain-text fallback shown **while** tokenization is in flight
  (or after a failed lemmatization). ADR-0019 converts per token at the render layer,
  so the pre-tokenized fallback always shows the source script — the row briefly
  shows source script before the converted tokens land, exactly like `SubtitleDisplay`.

## Acceptance criteria

| # | Criterion |
|---|---|
| G1 | With `display.traditional` on, a Simplified source line renders Traditional glyphs in every result row; with it off, an already-Traditional source renders Simplified (direction chosen by `detectChineseScript`, ADR-0019). |
| G2 | Phonetics in rows follow `tokenSpan.phonetics` (ruby / word / off, plus the `hardWords` condition) for phonetics-eligible L2s. |
| G3 | Clicking/tapping the L2 line opens playback. No dictionary popup can be opened from a row. |
| G4 | Saved words are not highlighted in rows, and no quick gloss renders. |
| G5 | Interlinear definitions never render in a row (row height = one L2 line + ruby). |
| G6 | Search terms are still highlighted in the L2 line and in the translation. |
| G7 | `[n]` note markers render as badges in the row (inert) and stay tappable in the playback modal. |
| G8 | Row text size follows the SPEC-051 block-level zoom (no `textScale` / `inline` / `inheritSize` override). |
| G9 | Same behaviour on web and mobile; mobile keeps OS font scaling enabled (SPEC-051 §6). |

## Performance note

Every visible row now lemmatizes and enqueues a batch dictionary lookup (needed for
ruby readings and the `hardWords` phonetics condition). This is the same lazy path
every other `TokenizedText` surface uses: `IntersectionObserver` (200px root margin)
delays tokenization until a row is near the viewport, and `enqueueLemmatize` /
`enqueueLookupWords` batch and dedupe across rows. Rows scrolled out of view never
tokenize.

## Open questions

- None blocking. If row-level readings ever prove too dense, the natural dial is the
  per-L2 `tokenSpan.phonetics` setting, which rows already obey — not a row-specific
  override.
