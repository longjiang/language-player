# SPEC-114 — Tokenized L2 Text in Dictionary Reading Surfaces

## Metadata

- **Spec ID**: SPEC-114
- **Feature**: Dictionary surfaces that show L2 sentences render them through `TokenizedText` — subs-search result rows (display-only) and the entry card's "Textbook Appearances" example (interactive) — so Chinese simplified↔traditional follows the learner's script preference and phonetics follow their display settings
- **Status**: complete (web + mobile, 2026-11-26)
- **Created**: 2026-11-26
- **ROADMAP Phase**: Phase 4 — Dictionary
- **Governing decisions**: [ADR-0019](../adr/0019-chinese-script-conversion-at-render-layer.md) (script conversion at the render layer), [ADR-0039](../adr/0039-flat-ruby-run-web.md) (flat ruby run)
- **Related specs**: [SPEC-051](051-mobile-text-scale-parity.md) (text size — every surface here follows the block-level rule), [SPEC-082](082-mobile-web-parity-reader-subs-sync.md) Task 7/16 (one matched line per row, longest-term highlight), [SPEC-093](093-video-subtitle-notes.md) (`[n]` note badges), [SPEC-109](109-subs-search-forms-filter.md) (which forms the list highlights)
- **As-built**: [ARCH-036](../arch/036-subs-search-architecture.md) § "Result row rendering"
- **Files**:
  - Subs-search result row: `apps/web/src/components/video/subs-search-row.tsx` (+ `subs-search-row.test.tsx`), `apps/mobile/components/video/SubsSearchRow.tsx`
  - Textbook appearances: `apps/web/src/components/dictionary-entry-card.tsx`, `apps/mobile/components/dictionary/DictionaryEntryCard.tsx`

## Overview

Two dictionary surfaces rendered an L2 sentence as **raw text**, bypassing
`TokenizedText` — and therefore everything it owns at the render layer:

| Surface | Was | Now |
|---|---|---|
| Subs-search result row (dictionary entry → **Examples from Videos**, and the "Examples from Videos" chips in a DeepSeek explanation) | plain string + substring `<mark>` | `TokenizedText`, **display-only** |
| Entry card → **TEXTBOOK APPEARANCES** → example sentence (compact popup, dictionary hub, and the full entry page) | `<RareGlyphText>` in a `<p>` / `<Text>` | `TokenizedText`, **interactive** |

What both were missing:

- **Chinese script preference** (ADR-0019). A learner with
  `display.traditional = true` reading a Simplified source saw Simplified text in
  these surfaces while the headword above them rendered Traditional.
- **Phonetics.** No pinyin / furigana / reading appeared, even when
  `tokenSpan.phonetics` asked for it everywhere else.

Both now delegate to `TokenizedText`. They differ in exactly one respect — what a
tap on a word does — because one is a list preview and the other is a reading
surface.

## Surface 1 — Subs-search result rows (display-only)

The row is a **preview**: a whole row is one tap target that opens playback, so
the tokenized line must not compete for the tap.

1. **Not interactive.** The tokenized span is wrapped in `pointer-events-none`
   (web) / `pointerEvents="none"` (mobile). Tokens never receive a click, so no
   dictionary popup opens and the tap falls through to the row. No per-token
   cursor, hover highlight, or selection affordance.
2. **No saved-word highlighting.** `highlightSaved={false}`. Because the quick
   gloss only renders for saved tokens, this also suppresses quick glosses — a row
   never shows "(def)" annotations.
3. **No interlinear definitions.** `showDefinition={false}`, so a row is one line
   of L2 text plus its phonetic ruby, never a stack of per-word glosses.

Kept from before:

- One matched line per row, no previous/next context (SPEC-082 Task 7).
- The search term stays highlighted — now via `highlightForms` /
  `highlightTerms` (token-level `HIGHLIGHT_CLASS`), which also catches a term
  inside a larger token (e.g. 武侠 in 武侠片) and inflected forms whose lemma
  matches.
- The muted/normal treatment of a segment without a term (`textColor`).
- `[n]` note markers are still stripped and drawn as badges (SPEC-093); in a row
  they are inert — the playback modal keeps them tappable.
- The translation line below (markdown, server-side `**term**` highlight),
  translation skeletons, and click-to-play behaviour are unchanged.
- No change to the playback modal — it renders `SubtitleDisplay` →
  `TokenizedText`, fully interactive.

## Surface 2 — Textbook Appearances example (interactive)

The entry card's study-material block shows, per material, the book/lesson/dialog
line plus the example sentence (`m.example`) and its translation. The example is a
real L2 reading line, so it gets the **normal** tokenized treatment — no
display-only overrides:

- A tap opens the dictionary popup for that word. This is a *stacked* popup when
  the card is already inside the popup dictionary — the same behaviour as the
  popup's context-sentence card, whose comment ("Tokens open their own stacked
  dictionary popup … Do NOT restore `disablePopup` here") is the precedent.
  (`apps/web/src/components/dictionary-popup.tsx`,
  `apps/mobile/components/dictionary/DictionaryPopup.tsx`.)
- Saved words highlight, and the quick gloss may render, as everywhere else.
- Phonetics and script conversion follow the settings.
- The translation line under the example is unchanged (an L1 string).

Applies to both card variants (`compact` in the popup / hub, `full` on the entry
page) and both platforms. `l2Code` comes from the card's prop, falling back to the
language context (`l2Code ?? l2.code` / `l2Code ?? l2Lang.code`).

## Text size — SPEC-051 applies, no exception

Neither surface is exempted from SPEC-051 § Target behavior 1: block-level
`TokenizedText` always renders at the user's zoom (16px–36px). So:

- a row's L2 line grows with the text-size setting, while its thumbnail and
  translation line keep their own sizes;
- the textbook example grows with the setting too, even though the rest of the
  entry card is fixed-size copy — it follows the same rule as the popup's
  context sentence, which already renders `TokenizedText` at 1× zoom.

No `textScale`, `inline`, or `inheritSize` override is used on either surface.

## Rendering contract

| Concern | Result row (web) | Result row (mobile) | Textbook example (both) |
|---|---|---|---|
| Component | `<TokenizedText>` | `<TokenizedText>` | `<TokenizedText>` |
| Interaction | `pointer-events-none` wrapper | `pointerEvents="none"` wrapper | none — taps open the popup |
| Popup | `disablePopup` | `disablePopup` | default (stacked popup) |
| Saved-word highlight | `highlightSaved={false}` | `highlightSaved={false}` | default (`true`) |
| Interlinear definitions | `showDefinition={false}` | `showDefinition={false}` | default |
| Search-term highlight | `highlightForms={highlightTerms}` | `highlightTerms={highlightTerms}` | none |
| Note badges | `notes={video.notes}` | `notes={video.notes}` | none |
| Text size | block-level (zoom applies) | block-level (zoom applies) | block-level (zoom applies) |

Applies to **every** L2, not just Chinese: phonetics appear only where the language
is phonetics-eligible and the setting is on, so a Latin-script row/example looks the
same as before while a Chinese/Japanese one gains readings.

## Non-goals

- Not changing the playback modal, the translation pipeline, the list's filters,
  sorting, grouping, or the forms filter (SPEC-109).
- Not highlighting the headword inside the textbook example (the card around the
  example already states the word).
- Not converting the plain-text fallback shown **while** tokenization is in flight
  (or after a failed lemmatization). ADR-0019 converts per token at the render
  layer, so the fallback shows the source script — the surface briefly shows source
  script before the converted tokens land, exactly like `SubtitleDisplay`.

## Acceptance criteria

| # | Criterion |
|---|---|
| G1 | With `display.traditional` on, a Simplified source line renders Traditional glyphs in every result row **and** every textbook example; with it off, an already-Traditional source renders Simplified (direction chosen by `detectChineseScript`, ADR-0019). |
| G2 | Phonetics follow `tokenSpan.phonetics` (ruby / word / off, plus the `hardWords` condition) for phonetics-eligible L2s, on both surfaces. |
| G3 | Clicking/tapping a result row's L2 line opens playback. No dictionary popup can be opened from a row. |
| G4 | Saved words are not highlighted in rows, and no quick gloss renders there. |
| G5 | Interlinear definitions never render in a row (row height = one L2 line + ruby). |
| G6 | Search terms are still highlighted in the row's L2 line and in its translation. |
| G7 | `[n]` note markers render as badges in the row (inert) and stay tappable in the playback modal. |
| G8 | Row and textbook-example text size follow the SPEC-051 block-level zoom (no `textScale` / `inline` / `inheritSize` override). |
| G9 | Same behaviour on web and mobile; mobile keeps OS font scaling enabled (SPEC-051 §6). |
| G10 | In the textbook example, tapping a word opens the dictionary popup (stacked when already inside the popup dictionary), in both the `compact` and `full` card variants. |
| G11 | The textbook example's translation line, material heading (book/lesson/dialog), and the separators between materials are unchanged. |

## Performance note

A row now lemmatizes and enqueues a batch dictionary lookup (needed for ruby
readings and the `hardWords` phonetics condition). This is the same lazy path every
other `TokenizedText` surface uses: `IntersectionObserver` (200px root margin)
delays tokenization until a row is near the viewport, and `enqueueLemmatize` /
`enqueueLookupWords` batch and dedupe across rows. Rows scrolled out of view never
tokenize. The entry card shows at most a handful of examples, so it is negligible
there.

## Open questions

- None blocking. If row- or example-level readings ever prove too dense, the
  natural dial is the per-L2 `tokenSpan.phonetics` setting, which both surfaces
  obey — not a surface-specific override.
