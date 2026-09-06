# SPEC-033: Native Text Selection Dictionary (Web)

## Metadata
- **Spec ID**: SPEC-033
- **Feature**: Select any portion of tokenized text and look it up in the dictionary popup
- **Status**: implemented (2026-08-02; revised 2026-08-02 — selection now opens the dictionary popup instead of an action menu; revised 2026-09-02 — substring selection inside a token wins over the whole-token popup, and cross-boundary phrases retokenize for highlighting)
- **Created**: 2026-08-02
- **ROADMAP Phase**: Phase 4 (Reading) — applies to the web reader, EPUB reader, web reader, and video transcripts

## Overview

`TokenizedText` currently offers per-word interaction (click a token → dictionary popup) and per-block actions (the ⋯ `TextActionMenu`). This feature adds a third entry point: the user drag-selects (or Shift-arrow-selects) any arbitrary portion of the text using the browser's native selection, and the dictionary popup opens with the selected text fed in as the lookup term — no lemma required. The popup shows the selected text as its header, followed by the DeepSeek explanation, the image strip, canonical phrase cards from the `/extract-phrases` endpoint (SPEC-036), and whatever dictionary entry cards the standard lookup returns.

When a multi-token phrase like 家賃滞納 is saved, `TokenizedText` retokenizes every matching line client-side: saved forms are matched against the token stream (longest-first, exact token-boundary alignment) and collapsed into a single atomic token, so the phrase highlights as saved, opens one dictionary popup, and behaves as one unit everywhere downstream (SPEC-033 §Phrase retokenization).

**Revision 2026-09-02 — substring selection & cross-boundary phrases.** Two gaps in the original design are closed:

1. **Substring of one token** — selecting 革命 inside 抓革命促 used to trigger the whole-token popup: the mouseup that ends the drag also fires a click on the token, and click ran before the deferred selection capture, clearing the selection. Now `TokenSpan` passes the clicked element to `onClick`, and `handleTokenClick` checks the live `window.getSelection()` in `selectionDictionary` contexts: a non-collapsed selection that intersects the token (`Range.intersectsNode`) suppresses the click, so the selection popup opens with the selected substring as the lookup term. The SRS review card stays tap-only (§Where Enabled).
2. **Phrases that cross token boundaries** — a saved or searched form like 掘藏 whose tokens split as 想掘｜藏 starts mid-token, so it could never merge, and whole-token matching never highlighted it (in the source text or the SRS review context). The new `splitPhraseTokens` stage (§Cross-boundary retokenization) splits such spans into an atomic phrase token plus placeholder fragments that are re-lemmatized individually.

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
7. Touch devices (iPhone/iPad Safari): the hook detects touch (`ontouchstart` / `maxTouchPoints`), tracks active touches via `touchstart`/`touchend`/`touchcancel`, and only opens the popup when every finger is off the screen and the selection has been quiet for 400 ms (mid-gesture `selectionchange` events while a finger is down are ignored). Desktop keeps the exact `mouseup`/`keyup` signals. `TokenizedText` also applies `-webkit-touch-callout: none` on the selection-enabled container so iOS's native long-press callout doesn't fight the dictionary popup.

### Components
- `use-selection-popup.ts` — native-selection capture + dismissal; returns `{ containerRef, selection, clear }`.
- `use-text-actions.ts` — shared copy/speak/translate handlers for `TextActionMenu` (the `/translate` call). The **AI-explain** action no longer goes through this hook: it opens the shared `AiExplanation` chat (`apps/web/src/components/ai-explanation.tsx`, SPEC-035) with the `TEXT_ACTION_ASK_AI_PRESETS` one-tap presets (*Summarize* / *Difficult expressions* / *Grammar points*) and the free-form follow-up input, auto-streaming a concise explanation via `TEXT_ACTION_ASK_AI_INITIAL_PRESET`.
- `text-action-panels.tsx` — shared `TranslatePanel` and `renderInlineMarkdown` for `TextActionMenu` (`ExplainPanel` is superseded by the `AiExplanation` chat for the AI-explain action).
- `tokenized-text.tsx` — new opt-in `selectionDictionary` prop; renders `DictionaryPopup` with the selected text as a lemma-less token and coordinates the two popups.
- `dictionary-popup.tsx` — optional `extractPhrases` prop (selection popup): calls `/extract-phrases`, looks up each phrase, and renders a "Phrases" card section with a loading spinner; shows the LLM pronunciation next to the header. Saved-word matching includes phrase-card entry IDs (plus a diagnostic log on mismatch) so words saved from the Phrases section aren't flagged as unrecognized.
- `merge-phrase-tokens.ts` (packages/utils) — pure, platform-agnostic retokenization helper: collapses saved multi-token phrase forms into single atomic tokens (longest-first, case-insensitive, exact token-boundary alignment; single-token forms and boundary-splitting selections are left untouched).
- `split-phrase-tokens.ts` (packages/utils) — cross-boundary retokenization (2026-09-02, §Cross-boundary retokenization): splits tokens that a saved/search phrase crosses into an atomic phrase token plus placeholder fragments (web consumer only; mobile keeps the merge-only behavior).
- `token-span.tsx` — ruby `<rt>` readings are `select-none` so `selection.toString()` matches the source text; passes the clicked element through `onClick` for the substring-selection arbitration.

### States
- **Selection made** — the dictionary dialog opens, anchored visually to the selection rect (spawn animation); header is the selected text.
- **No selection / collapsed** — no popup.
- **Lookup in flight / empty** — the dialog shows its loading spinner; if no entries come back, the "no dictionary entry" state renders with the AI explanation and images still available.
- **Edge cases** — quiz-mode blanks and annotation glosses are `select-none` (selection skips them); `phoneticsMode === 'word'` selects the visible pronunciation; traditional-Chinese display selects the displayed glyphs; those strings become the lookup term as-is.

### Where Enabled
- `ReaderPanel` (notes reader + web reader fallback), `EpubReaderPanel`, and both subtitle transcript modes in `subtitle-display.tsx`.
- Not enabled on the SRS review card (the card container is already `select-none`) or the tokenizer page.

## Cross-boundary retokenization (2026-09-02)

`mergePhraseTokens` only merges phrases whose start AND end land on token boundaries, and saved/highlight matching downstream is whole-token. A form like 掘藏 inside 想掘｜藏 (Jieba's split of the sentence 少年去游荡，中年想掘藏，老年做和尚。) therefore saved fine from the selection popup but never highlighted — in the source text or in the SRS review context sentence. Same for a substring like 革命 inside the single token 抓革命促.

`TokenizedText` now inserts a **split stage** before the merge: `displayTokens = mergePhraseTokens(text, splice(splitPhraseTokens(text, tokens, forms)), forms)` where `forms` is the union of saved phrase candidates, highlight kana forms, `highlightForm`, and `highlightForms` (search terms included — user decision 2026-09-02).

- `splitPhraseTokens` (packages/utils) collapses each boundary-crossing occurrence into one atomic token (`{ text: <source slice>, lemmas: [{ lemma: <source slice> }] }` — the merge token shape) and turns each leftover partial token into a **placeholder fragment** (`lemmas: []`). Occurrences claim longest-first, non-overlapping, and never share a token; boundary-aligned occurrences are left for the merge.
- Splitting is gated to **spaceless scripts** (Han / Kana / Thai / Lao / Khmer) with phrases of ≥2 characters starting and ending in such a script. Space-delimited languages are excluded so a short saved form like "he" can never shred every token containing it; their inflected forms already align to whole tokens.
- Each unique fragment (e.g. 想 from 想掘) is **re-lemmatized** through the shared batch queue (`enqueueLemmatize`, cache-first, deduped) so it regains its own lemma and pronunciation and becomes interactive again. The re-lemmatized tokens are spliced back — cloned per splice (duplicate fragments must not share object identity) and only when they tile the fragment exactly, so the output always reconstructs `text` character-for-character and format offsets, karaoke pacing, hover ranges, and sentence context stay aligned. Fragments that fail or resolve empty stay non-interactive placeholders (the pre-change rendering).
- Mobile is **not** affected: `apps/mobile/components/TokenizedText.tsx` keeps the merge-only pipeline (SPEC-084 documents its selection machinery; porting the split there is future work).

## Dependencies
- Existing `TextActionMenu` actions, `useSpeech`, `useStreamingExplanation` (`@langplayer/api-client`), and the Flask `/translate` endpoint — no new endpoints or i18n keys.

## Open Questions
- Mobile port: React Native `Text` supports `onSelectionChange`, so a similar popup is feasible in `apps/mobile`; it should be ported if this ships as a core interaction.
- Cross-boundary retokenization (2026-09-02): port the `splitPhraseTokens` stage + fragment re-lemmatization to `apps/mobile` for parity (mobile currently keeps merge-only behavior).
