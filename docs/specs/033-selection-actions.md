# SPEC-033: Native Text Selection Dictionary (Web)

## Metadata
- **Spec ID**: SPEC-033
- **Feature**: Select any portion of tokenized text and look it up in the dictionary popup
- **Status**: implemented (2026-08-02; revised 2026-08-02 — selection now opens the dictionary popup instead of an action menu)
- **Created**: 2026-08-02
- **ROADMAP Phase**: Phase 4 (Reading) — applies to the web reader, EPUB reader, web reader, and video transcripts

## Overview

`TokenizedText` currently offers per-word interaction (click a token → dictionary popup) and per-block actions (the ⋯ `TextActionMenu`). This feature adds a third entry point: the user drag-selects (or Shift-arrow-selects) any arbitrary portion of the text using the browser's native selection, and the dictionary popup opens with the selected text fed in as the lookup term — no lemma required. The popup shows the selected text as its header, followed by the DeepSeek explanation, the image strip, and whatever dictionary entry cards the lookup returns (for arbitrary phrases these are usually LLM-generated entries; when nothing is found the "no dictionary entry" state still renders alongside the AI explanation and images).

## User Stories
- As a learner, I want to select a phrase I don't understand and see its dictionary entry, AI explanation, and related images.

## Implementation Plan (Next.js)

### Data Flow
1. `useSelectionPopup` listens for `mouseup` / `keyup` (Shift + arrows, Home/End/PgUp/PgDn) on `document` and reads `window.getSelection()`.
2. A selection is captured only when it is non-collapsed and its `commonAncestorContainer` is inside the `TokenizedText` container; the captured payload is the selected string plus the range's viewport rect.
3. `TokenizedText` renders `DictionaryPopup` with a lemma-less token (`{ text: <selection>, lemmas: [] }`), the selection rect as the spawn origin, and the block text as context.
4. Dismissal: the popup's close button/overlay/Escape (Radix Dialog) or a token click closes it; `clear()` also collapses the native selection so a dismissed popup cannot re-open on a stray click. The hook's `selectionchange` listener hides the popup if the selection collapses or moves outside the container.

### Components
- `use-selection-popup.ts` — native-selection capture + dismissal; returns `{ containerRef, selection, clear }`.
- `use-text-actions.ts` — shared copy/speak/explain/translate handlers for `TextActionMenu` (single source for the AI-explain prompt builder and `/translate` call).
- `text-action-panels.tsx` — shared `ExplainPanel`, `TranslatePanel`, and `renderInlineMarkdown` for `TextActionMenu`.
- `tokenized-text.tsx` — new opt-in `selectionDictionary` prop; renders `DictionaryPopup` with the selected text as a lemma-less token and coordinates the two popups.
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
