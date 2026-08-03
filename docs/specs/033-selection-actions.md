# SPEC-033: Native Text Selection Actions (Web)

## Metadata
- **Spec ID**: SPEC-033
- **Feature**: Select any portion of tokenized text and act on it via a popup menu
- **Status**: implemented (2026-08-02)
- **Created**: 2026-08-02
- **ROADMAP Phase**: Phase 4 (Reading) — applies to the web reader, EPUB reader, web reader, and video transcripts

## Overview

`TokenizedText` currently offers per-word interaction (click a token → dictionary popup) and per-block actions (the ⋯ `TextActionMenu`). This feature adds a third entry point: the user drag-selects (or Shift-arrow-selects) any arbitrary portion of the text using the browser's native selection, and a small popup menu appears anchored to the selection with the same actions as `TextActionMenu` — copy, speak (TTS), AI explain, and translate — applied to the selected substring.

## User Stories
- As a learner, I want to select a phrase I don't understand and translate just that phrase.
- As a learner, I want to select a sentence fragment and hear it spoken aloud.
- As a learner, I want to copy a selected phrase or get an AI explanation for it without leaving the page.

## Implementation Plan (Next.js)

### Data Flow
1. `useSelectionPopup` listens for `mouseup` / `keyup` (Shift + arrows, Home/End/PgUp/PgDn) on `document` and reads `window.getSelection()`.
2. A selection is captured only when it is non-collapsed and its `commonAncestorContainer` is inside the `TokenizedText` container; the captured payload is the selected string plus the range's viewport rect.
3. `TokenizedText` renders `SelectionActionMenu` at that rect; the menu shares the copy/speak/explain/translate logic with `TextActionMenu` via the `useTextActions` hook.
4. Dismissal is handled by the hook: outside mousedown (the menu root stops propagation of its own mousedowns), selection collapse/move via `selectionchange`, `Escape`, scroll, or a token click (the dictionary popup supersedes the selection popup, and vice versa).

### Components
- `use-selection-popup.ts` — native-selection capture + dismissal; returns `{ containerRef, selection, clear }`.
- `use-text-actions.ts` — shared copy/speak/explain/translate handlers extracted from `TextActionMenu` (single source for the AI-explain prompt builder and `/translate` call).
- `text-action-panels.tsx` — shared `ExplainPanel`, `TranslatePanel`, and `renderInlineMarkdown`, used by both menus.
- `selection-action-menu.tsx` — fixed-position popup anchored to the selection rect, clamped/flipped to the viewport; four actions with the same labels/icons as `TextActionMenu`.
- `tokenized-text.tsx` — new opt-in `selectionMenu` prop; coordinates the two popups.
- `token-span.tsx` — ruby `<rt>` readings are `select-none` so `selection.toString()` matches the source text.
- `clipboard.ts` — copy helper: Clipboard API first, `execCommand('copy')` fallback for contexts where `navigator.clipboard` is unavailable; restores the selection after the fallback.

### States
- **Selection made** — popup appears below the selection (flips above when near the viewport bottom; clamped horizontally).
- **Popup markup** — the menu is portaled to `document.body` so it is never a child of the reader's `<p>` blocks (which would trigger React's DOM-nesting warning).
- **No selection / collapsed** — no popup.
- **Explain / translate in flight** — the action row shows a spinner; explain opens the existing full-screen modal; translate renders the inline result panel below the popup.
- **Edge cases** — quiz-mode blanks and annotation glosses are `select-none` (selection skips them); `phoneticsMode === 'word'` selects the visible pronunciation; traditional-Chinese display selects the displayed glyphs; those strings are passed to actions as-is.

### Where Enabled
- `ReaderPanel` (notes reader + web reader fallback), `EpubReaderPanel`, and both subtitle transcript modes in `subtitle-display.tsx`.
- Not enabled on the SRS review card (the card container is already `select-none`) or the tokenizer page.

## Dependencies
- Existing `TextActionMenu` actions, `useSpeech`, `useStreamingExplanation` (`@langplayer/api-client`), and the Flask `/translate` endpoint — no new endpoints or i18n keys.

## Open Questions
- Mobile port: React Native `Text` supports `onSelectionChange`, so a similar popup is feasible in `apps/mobile`; it should be ported if this ships as a core interaction.
