# SPEC-033: Native Text Selection Dictionary (Web)

## Metadata
- **Spec ID**: SPEC-033
- **Feature**: Select any portion of tokenized text and look it up in the dictionary popup
- **Status**: implemented (2026-08-02; revised 2026-08-02 — selection now opens the dictionary popup instead of an action menu)
- **Created**: 2026-08-02
- **ROADMAP Phase**: Phase 4 (Reading) — applies to the web reader, EPUB reader, web reader, and video transcripts

## Overview

`TokenizedText` currently offers per-word interaction (click a token → dictionary popup) and per-block actions (the ⋯ `TextActionMenu`). This feature adds a third entry point: the user drag-selects (or Shift-arrow-selects) any arbitrary portion of the text using the browser's native selection, and the dictionary popup opens with the selected text fed in as the lookup term — no lemma required. The popup shows the selected text as its header, followed by the DeepSeek explanation, the image strip, canonical phrase cards from the `/extract-phrases` endpoint (SPEC-036), and whatever dictionary entry cards the standard lookup returns.

When a multi-token phrase like 家賃滞納 is saved, `TokenizedText` retokenizes every matching line client-side: saved forms are matched against the token stream (longest-first, exact token-boundary alignment) and collapsed into a single atomic token, so the phrase highlights as saved, opens one dictionary popup, and behaves as one unit everywhere downstream (SPEC-033 §Phrase retokenization).

## User Stories
- As a learner, I want to select a phrase I don't understand and see its dictionary entry, AI explanation, and related images.

## Implementation Plan (Next.js)

### Data Flow
1. `useSelectionPopup` listens for `mouseup` / `keyup` (Shift + arrows, Home/End/PgUp/PgDn) on `document` and reads `window.getSelection()`.
2. A selection is captured only when it is non-collapsed and its `commonAncestorContainer` is inside the `TokenizedText` container; the captured payload is the selected string plus the range's viewport rect.
3. `TokenizedText` renders `DictionaryPopup` with a lemma-less token (`{ text: <selection>, lemmas: [] }`), the selection rect as the spawn origin, and the immediate sentence containing the selection as context — the hook computes the selection's character offset in the source text (skipping `select-none` annotations) and reuses the same `sentenceContaining`/Intl.Segmenter path as token clicks, so arbitrary selections and tokens get consistent sentence context.
4. With `extractPhrases` (selection only), the popup also POSTs the selection to `/extract-phrases`, looks each returned canonical phrase up through the standard `/dictionary/lookup`, and renders a "Phrases" section of entry cards (deduplicated against the standard results) with the LLM pronunciation shown next to the header.
5. Dismissal: the popup's close button/overlay/Escape (Radix Dialog) or a token click closes it; `clear()` also collapses the native selection so a dismissed popup cannot re-open on a stray click. There is no `selectionchange` auto-close — clicking or dragging inside the dialog collapses/replaces the underlying selection, and that must not unmount the popup mid-interaction.
6. Retokenization: after tokens resolve (any source), `TokenizedText` derives `displayTokens = mergePhraseTokens(text, tokens, savedForms)` where `savedForms` is the union of every saved record's `forms[]`, `context.form`, and instance forms for the L2. Spans of ≥2 tokens that reconstruct a saved form are replaced by one token (`{ text: <source slice>, lemmas: [{ lemma: <source slice> }] }`); total length is preserved, so format offsets, karaoke pacing, and sentence context stay aligned.

### Components
- `use-selection-popup.ts` — native-selection capture + dismissal; returns `{ containerRef, selection, clear }`.
- `use-text-actions.ts` — shared copy/speak/explain/translate handlers for `TextActionMenu` (single source for the AI-explain prompt builder and `/translate` call).
- `text-action-panels.tsx` — shared `ExplainPanel`, `TranslatePanel`, and `renderInlineMarkdown` for `TextActionMenu`.
- `tokenized-text.tsx` — new opt-in `selectionDictionary` prop; renders `DictionaryPopup` with the selected text as a lemma-less token and coordinates the two popups.
- `dictionary-popup.tsx` — optional `extractPhrases` prop (selection popup): calls `/extract-phrases`, looks up each phrase, and renders a "Phrases" card section with a loading spinner; shows the LLM pronunciation next to the header. Saved-word matching includes phrase-card entry IDs (plus a diagnostic log on mismatch) so words saved from the Phrases section aren't flagged as unrecognized.
- `merge-phrase-tokens.ts` (packages/utils) — pure, platform-agnostic retokenization helper: collapses saved multi-token phrase forms into single atomic tokens (longest-first, case-insensitive, exact token-boundary alignment; single-token forms and boundary-splitting selections are left untouched).
- `token-span.tsx` — ruby `<rt>` readings are `select-none` so `selection.toString()` matches the source text.

### States
- **Selection made** — the dictionary dialog opens, anchored visually to the selection rect (spawn animation); header is the selected text.
- **No selection / collapsed** — no popup.
- **Lookup in flight / empty** — the dialog shows its loading spinner; if no entries come back, the "no dictionary entry" state renders with the AI explanation and images still available.
- **Edge cases** — quiz-mode blanks and annotation glosses are `select-none` (selection skips them); `phoneticsMode === 'word'` selects the visible pronunciation; traditional-Chinese display selects the displayed glyphs; those strings become the lookup term as-is.

### Where Enabled
- `ReaderPanel` (notes reader + web reader fallback), `EpubReaderPanel`, and both subtitle transcript modes in `subtitle-display.tsx`.
- Not enabled on the SRS review card (the card container is already `select-none`) or the tokenizer page.

## Dependencies
- Existing `TextActionMenu` actions, `useSpeech`, `useStreamingExplanation` (`@langplayer/api-client`), and the Flask `/translate` endpoint — no new endpoints or i18n keys.

## Open Questions
- Mobile port: React Native `Text` supports `onSelectionChange`, so a similar popup is feasible in `apps/mobile`; it should be ported if this ships as a core interaction.
