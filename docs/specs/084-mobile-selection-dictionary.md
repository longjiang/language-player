# Feature Specification: Mobile Native Text Selection Dictionary (SPEC-033 port)

## Metadata

- **Spec ID**: SPEC-084
- **Feature**: Port SPEC-033 (native text selection → dictionary popup) to `apps/mobile/`, matching `apps/web`
- **Status**: in-progress (all 6 tasks implemented, commits `12cedf42`…`e827735a`; native device verification pending — no build executed)
- **Created**: 2026-08-18
- **ROADMAP Phase**: Mobile parity — Reading / Media / Vocab
- **Web ref**: SPEC-033 (`docs/specs/033-selection-actions.md`), web sources `apps/web/src/hooks/use-selection-popup.ts`, `apps/web/src/components/tokenized-text.tsx`, `apps/web/src/components/dictionary-popup.tsx`, shared `packages/utils/src/sentence.ts` (`sentenceContaining`), `packages/utils` `mergePhraseTokens` (already consumed by mobile)

## Overview

SPEC-033 gives the learner a third lookup entry point: drag-select any portion of tokenized text and the dictionary popup opens with the selection as the lookup term (no lemma required), showing the selected text as the header, the AI explanation, image strip, canonical phrase cards from `/extract-phrases`, and the standard dictionary entry cards. It is implemented on web only; its "Open Questions" explicitly anticipate the mobile port ("React Native `Text` supports `onSelectionChange`, so a similar popup is feasible in `apps/mobile`").

Mobile is **not** a blank slate:

- **Phrase retokenization is already ported** — `TokenizedText` calls shared `mergePhraseTokens` (`apps/mobile/components/TokenizedText.tsx:452`), so saved multi-token phrases already collapse into atomic tokens.
- **Sentence context helpers exist** — `sentenceContaining(text, offset, locale)` is in shared utils (`packages/utils/src/sentence.ts:149`); the token popup already uses its sibling `sentenceForToken`.
- **The popup needs no anchoring** — mobile `DictionaryPopup` is a modal (bottom sheet on narrow, **top-anchored dialog on md+** — fixed `insets.top + 64`, grows downward; see SPEC-052), so the web hook's entire selection-rect machinery (`use-selection-popup.ts` range rect) is unnecessary.

The genuine work is **native text selection on RN**, which differs from the browser in three platform-specific ways. All three are analyzed below (Tasks 1–3); the JS wiring and the Phrases section are Tasks 4–5. Expo Go is explicitly out of scope — dev/release builds only (user decision; SPEC-048 §1.4 already bans Expo Go for physical devices).

## User Stories

- As a mobile learner, I want to long-press and drag-select a phrase I don't understand and get its dictionary entry, AI explanation, related images, and canonical phrase cards — same as on web.
- As a CJK reader, I want this to work on the ruby-rendered reader text (furigana displayed), not just plain text.

## Platform Constraints (confirmed by source, 2026-08-18)

Three render paths exist in `TokenizedText`, with different selection support:

| Path | Trigger | Host | Selection today |
|---|---|---|---|
| Native ruby paragraph | `NATIVE_PARAGRAPH_ACTIVE && !showDefinition` (default for ja/ko) | **iOS**: `RubyTextParagraphView.swift` — a `UITextView` with `isSelectable = false` (line 56). **Android**: `RubyTextParagraphView.kt` — a bare `ExpoView` that paints glyphs with `Canvas.drawText()` (`draw()` lines 119–160, hand-rolled wrapping `buildLines()` 162–203, manual tap hit-test `onTouchEvent()` 240–257) | iOS: blocked by one flag. Android: no text model at all — selection impossible without a renderer rewrite |
| View-based ruby/definition | `showDefinition` on, or native module missing (Expo Go) | Per-token `Pressable` + `RubyText` spans / `Text` columns | No cross-token selection (separate Views) |
| Plain inline `Text` | Phonetics off / non-ruby (word-replace or `phonetics.show === false`) | One RN `<Text>` with nested `PlainTokenSpan` (`Text` + `onPress`) children | RN `selectable` + `onSelectionChange` works (both platforms) — needs wiring only |

Key findings:

1. **iOS ruby text** is a real `UITextView` — flip `isSelectable = true`, bridge selection via `UITextViewDelegate`. Native handles/highlight come free; the highlight draws over the ruby. Selection text is pure base text (readings are `CTRubyAnnotation` attributes, not part of the string) — matching web's `select-none` on `<rt>`.
2. **Android ruby text** is Canvas-painted — no selectable text exists. The rewrite (Task 2) makes the view itself a `TextView` with one `ReplacementSpan` per token (reading drawn above the base in the span box). **Atomic spans are acceptable**: the current canvas renderer already never splits a run (`buildLines()` wraps whole tokens), so span atomicity is behavior parity, not a regression. Android has no Core Text ruby — no overhang into punctuation — which is accepted (user decision). Reading drawn outside the span's `CharSequence` keeps `selection.toString()` = base text.
3. **expo-modules-kotlin registers any `android.view.View` subclass** (`ViewDefinitionBuilder<T : View>`), so `RubyTextParagraphView` may extend `AppCompatTextView` directly; `ExpoView` is a convenience base, not a requirement. This sidesteps the old Fabric blocker (a *child* TextView added in `init` is never laid out) because the host view **is** the TextView and JS still passes the measured box via `style`.
4. **RN plain `Text`** selection works on both platforms, but a selectable `Text` can swallow taps — per-token `onPress` coexistence must be verified per platform (web has both tap and drag; RN may need the selection to merely *supersede* taps while active, which is already web's dismissal rule).

---

## Task 1 — iOS native selection in `RubyTextParagraphView`

- **Web ref**: SPEC-033 §Components `use-selection-popup.ts` (touch settle semantics: capture once every finger is up and the selection is quiet ~400 ms).
- **Mobile state**: `apps/mobile/modules/ruby-text/ios/RubyTextParagraphView.swift` — `textView.isSelectable = false` (line 56); tap handling via an external `UITapGestureRecognizer` on the view (lines 65–66, 101–108); run→offset mapping already exists (`run(atUtf16Offset:)`, lines 110–122). Module events declared in `RubyTextModule.swift:89` (`Events("onTokenTap", "onLineGrid")`); TS props in `apps/mobile/modules/ruby-text/src/index.ts` (`NativeRubyTextParagraphProps`, lines 81–99).
- **Plan**:
  1. `textView.isSelectable = true`; keep `isEditable = false`, `isScrollEnabled = false`.
  2. Set `textView.delegate = self`; implement `textViewDidChangeSelection` → emit new `onSelection` event `{ start, end }` (UTF-16 offsets into `textView.text` — readings excluded because they are `CTRubyAnnotation` attributes). Only emit when `start != end` (non-collapsed); JS applies the settle timer.
  3. **Clear mechanism**: collapse the native selection when the popup dismisses (web's `clear()` calls `removeAllRanges`). Add a JS-controlled prop (e.g. `clearSelection` nonce) or module function that sets `textView.selectedRange = NSRange(location: <end>, length: 0)`.
  4. **Tap vs selection arbitration** (risk): with `isSelectable = true`, the `UITextView`'s internal gesture recognizers may claim single taps and starve the existing external `UITapGestureRecognizer`. Verify on device; if starved, coordinate via gesture delegates (`gestureRecognizer(_:shouldRecognizeSimultaneouslyWith:)`) or attach the tap recognizer to the `textView` and fail it while `selectedRange.length > 0`. Token taps must keep working.
  5. **Callout suppression**: implement `UITextViewDelegate.textView(_:editMenuForTextIn:suggestedActions:)` returning an empty menu (iOS 16+; RN 0.86's deployment target is 15.1, so gate with `#available` and fall back to a `canPerformAction` override). Selection handles remain; the Copy/Select-All menu disappears.
- **Edge cases**: selection crossing a line break; RTL books (`isRtl`); rapid re-drag (continuous events — JS settles); zero-length drag (no event).
- **Test**: manual on iOS dev build with a ja book — long-press selects, handles drag, `onSelection` offsets match `runs` boundaries, tap-to-lookup still works, no callout.

## Task 2 — Android paragraph renderer rewrite: Canvas → `TextView` + `ReplacementSpan`s

- **Web ref**: none (web uses browser selection); parity target is *no visible regression* + native selection (user-accepted: "atomic spans are ok", no overhang fidelity required).
- **Mobile state**: `apps/mobile/modules/ruby-text/android/src/main/java/expo/modules/rubytext/RubyTextParagraphView.kt` — `ExpoView` painting everything in `draw()`; `RubyTextModule.kt:73–117` registers the view (`Events("onTokenTap")`); the per-token `RubyTextView.kt` is also Canvas-based (out of scope here).
- **Plan**:
  1. Change `RubyTextParagraphView` to extend `androidx.appcompat.widget.AppCompatTextView` (expo-modules-kotlin registers any `View` subclass). Keep the JS-measured box pattern: JS renders an invisible RN `Text` with the same metrics and passes the box via `style` — the view no longer measures itself.
  2. Build a `SpannableString` from `runs`: one custom `ReplacementSpan` per run whose `getSize()` returns the run's advance (`max(baseWidth, readingWidth)` — same math as today's `buildLines()`), and whose `draw()` paints the reading above the base (same `readingSize`/`rubyPull`/colors/bold/italic/underline/background/opacity attributes as the current `Paint` setup). The span's `CharSequence` text is **base text only** — readings live in the span's `draw()`, so `selection.toString()` returns pure base text.
  3. Fixed paragraph metrics: `setLineSpacing`/`setIncludeFontPadding` to reproduce `lineHeight` (base line + reserved reading slot), `setTextDirection` for `isRtl`. *(Pin superseded 2026-09-03: a `LineHeightSpan` absorbs the extra leading ABOVE each line's ascent so span-free runs and ruby spans share one baseline — `setLineSpacing` added it below the descent and punctuation floated into the reading band; see ARCH-030 "Android baseline pin".)*
  4. `setTextIsSelectable(true)`; override `onSelectionChanged(selStart, selEnd)` → emit `onSelection { start, end }` (non-collapsed only). Add the event to `RubyTextModule.kt`'s paragraph `Events(...)` and to `NativeRubyTextParagraphProps`.
  5. Tap mapping: replace the manual `onTouchEvent` hit-test with `getOffsetForPosition(x, y)` → find the span containing the offset → its `tokenId` → `onTokenTap`.
  6. **Callout suppression**: `setCustomSelectionActionModeCallback` with a no-op callback hides the Android context menu; handles stay.
  7. Clear mechanism mirrors Task 1.3 (`setSelection` on a prop nonce).
- **Edge cases**: CJK line wrapping (StaticLayout handles break opportunities — strictly better than today's run-boundary wrapping); a token wider than the line wraps whole (parity); selection across lines; RTL; karaoke dimming (opacity on spans via alpha — `ReplacementSpan` draws with the run's opacity as today).
- **Test**: visual QA ja/ko book on Android dev build — readings centered, line heights identical to the pre-rewrite build (screenshot diff), tap-to-lookup, selection, no context menu. Unit: span advance == canvas advance for the same runs; offset→token mapping.

## Task 3 — JS bridge: `RubyTextParagraph` selection events

- **Files**: `apps/mobile/components/RubyText.tsx` (`RubyTextParagraph`, lines 272–449; native view wiring 448–449), `apps/mobile/components/tokenized-text-spans.tsx` (`RubyTextParagraphBlock`, lines 354–404), `apps/mobile/modules/ruby-text/src/index.ts`.
- **Plan**:
  1. `NativeRubyTextParagraphProps` gains `onSelection?: (event: { nativeEvent: { start: number; end: number } }) => void` and `clearSelection?: number` (nonce → native collapses the range).
  2. `RubyTextParagraph` and `RubyTextParagraphBlock` forward both; `RubyTextParagraphBlock` adds an `onSelectionChange?: (range: { start: number; end: number }) => void` prop.
  3. iOS + Android both emit UTF-16 offsets into the **base-text string** — the concatenation of `run.text` in order, which JS builds 1:1 from `displayTokens` (paragraph path pushes exactly one run per token, `TokenizedText.tsx:1197–1253`). So native offset → token index via cumulative run lengths; then source offset via the same `displayTokens` cumulative map (Task 4).
- **Test**: unit-test the offset→token→source mapping with mixed whitespace/punctuation runs; manual on both platforms.

## Task 4 — `TokenizedText` selectionDictionary prop + popup wiring

- **Web ref**: `apps/web/src/components/tokenized-text.tsx` — `selectionDictionary` prop (140/179), `useSelectionPopup` (223), supersede logic (486–493), sentence context with substring fallback (505–516), selection popup render (809–825).
- **Mobile state**: `apps/mobile/components/TokenizedText.tsx` — token popup state (`selectedWord` etc., 173–177), `DictionaryPopup` mount (1430–1444), plain-path outer `Text` (1337) and paragraph-path block (1306–1325), `tokenRanges`/`displayTokens` (449–470).
- **Plan**:
  1. Add `selectionDictionary?: boolean` to `TokenizedTextProps`.
  2. When enabled, wire selection in **both** host paths:
     - **Plain path**: outer `Text` gets `selectable` + `onSelectionChange`; offsets are into the rendered string (may differ from `text` via script conversion / phonetics-replace / quiz blank) → build a rendered→source offset map from `displayTokens` using the same per-token display-text logic; fallback: substring search (`text.indexOf(selectedText)`, web parity).
     - **Paragraph path**: pass `onSelectionChange` through Task 3; native offsets → source via cumulative run lengths (see Task 3.3).
  3. **Settle timer**: after the last `onSelectionChange` (drag handles fire continuously), wait ~400 ms, then if `start != end` compute `selectedText = text.slice(start, end)` and open the popup. Ignore changes while the popup is open (web: no selectionchange auto-close).
  4. **Supersede rules** (web parity): a new selection clears the token popup; a token press clears the selection. `clear()` also collapses the native selection via the Task 1/2 clear mechanism so a dismissed popup cannot re-open on a stray gesture.
  5. Selection popup: `DictionaryPopup visible word={selectedText} context={sentenceContaining(text, startOffset, baseCode(l2Code))} extractPhrases …` — lemma omitted (lemma-less lookup, exactly web's `{ text: <selection>, lemmas: [] }`).
  6. Per-token taps + selectable Text coexistence on the plain path: verify on both platforms (RN nested `Text onPress` inside a `selectable` parent). If taps conflict, selection supersedes taps only while a selection is active — the reader still has tap-to-lookup between selections.
- **Edge cases**: selection wholly inside a saved-phrase atomic token; selection spanning a format/link boundary; quiz-blanked tokens (`▯` — map handles it, or exclude from selectable text); RTL; offline-without-dictionary (reuse the existing `offlineNoDict` behavior — plain text, tap explains; selection should still open the popup's offline lookup path).
- **Test**: unit tests for the offset map (script conversion, phonetics-replace, quiz blank, whitespace runs); manual both platforms both paths.

## Task 5 — `DictionaryPopup` `extractPhrases` ("Phrases" section)

- **Web ref**: `apps/web/src/components/dictionary-popup.tsx` — prop (40–43, 56), extraction effect (112–186: `POST ${PYTHON_API_URL}/extract-phrases` body `{ text, lang: baseCode(l2Code) }` → `phrases[]` + optional `pronunciation`; per-phrase cache→lookup; dedupe), Phrases section header `t('label.phrases')` (477–481), phrase-card ids included in saved-word matching (304–311).
- **Mobile state**: `apps/mobile/components/dictionary/DictionaryPopup.tsx` — lookup pipeline already has cache → offline SQLite → `bulkLookupWords` → single `lookup` fallback (174–336); header (397–426); entry cards with `SaveButton` (490–517). i18n key `label.phrases` already exists (`translations.csv:338`).
- **Plan**:
  1. Add `extractPhrases?: boolean` prop. When set and `word` is non-empty, run the web-parity effect: POST `/extract-phrases` (`{ text: word, lang: baseCode(l2Code) }`), read `phrases[]` (filter empty), optional `pronunciation` (shown next to the header, `[pronunciation]` like `tokenPron`).
  2. Look up each phrase through the existing pipeline order (cache → offline → `bulkLookupWords` → single lookup), dedupe by entry id, and dedupe against the standard lookup results.
  3. Render a "Phrases" section (`t('label.phrases')`) of `DictionaryEntryCard`s (with `SaveButton`, same `context` shape as the standard cards) above/below the standard results, with its own loading spinner (`phraseLoading`).
  4. Mobile has no "unrecognized saved word" UI (web-only), so the phrase-card id union (web 304–311) is **not** needed — note this divergence in a comment.
- **Edge cases**: `/extract-phrases` down (silently skip the section, keep standard results — web parity); empty phrase list; selection that's a single word (section still renders if the endpoint returns the word's phrases).
- **Test**: manual with a multi-word selection; mock/offline check that failure never blocks the standard cards.

## Task 6 — Enable selection where web enables it

- **Web ref**: SPEC-033 §Where Enabled — ReaderPanel (notes + web reader), EpubReaderPanel, both subtitle transcript modes. Not on the SRS review card or tokenizer page.
- **Mobile plan**:
  1. `PaginatedReader` gains `selectionDictionary?: boolean`, threaded to `TokenizedText` in `renderBlock` (`apps/mobile/components/reader/PaginatedReader.tsx`).
  2. Enable on the reader screens: `apps/mobile/app/(tabs)/(reading)/epub.tsx`, `web-reader.tsx`, `(reading)/index.tsx` (notes reader) — matching web's EpubReaderPanel + ReaderPanel.
  3. Enable on subtitle **transcript** mode: both `TokenizedText` usages in `apps/mobile/components/video/SubtitleDisplay.tsx` (singleline 227, multiline 300). Not the on-video band (karaoke timing + selection conflict; web only enables transcript modes).
  4. Not enabled: SRS review card, AI explanation/inline text, quiz mode.

## Dependencies

- SPEC-033 (web reference implementation), SPEC-082 (reader parity — all three readers already share `PaginatedReader`).
- `packages/utils` `mergePhraseTokens` + `sentenceContaining` (existing; no changes).
- Flask `/extract-phrases` endpoint (exists; web-only consumer today).
- No new i18n keys (`label.phrases` exists).
- Expo Go explicitly out of scope: native paragraph selection requires dev/release builds (iOS module + Android rewrite); plain-path selection works in Expo Go as a partial fallback.

## Open Questions / Risks

1. **iOS tap vs selection arbitration** (Task 1.4) — the highest-risk item; must be validated on device before the rest of the iOS work is considered done.
2. **RN plain-path tap/select coexistence** (Task 4.6) — `selectable` Text swallowing nested `onPress` on either platform would force the "selection supersedes taps" compromise.
3. **Android TextView in ScrollView** — long-press selection vs the reader's scroll gestures; standard Android behavior is workable but needs device QA (page-flip pan is a horizontal gesture, so conflict should be minimal).
4. **Android callout suppression** (`setCustomSelectionActionModeCallback`) — verify the empty callback doesn't remove the selection handles on the target Android version range.
5. **Selection text fidelity** — script-converted / phonetics-replaced display: selection captures displayed glyphs as the lookup term (web parity, SPEC-033 §States "Edge cases"), offset map handles the mapping; substring fallback covers map failures.
6. **Line grid** (AlignedTranslation baseline alignment) stays iOS-only — Android already falls back to the plain column; the rewrite does not add Android line grids (out of scope).

## Implementation Status (2026-08-18)

All six tasks are implemented and committed; `tsc --noEmit` (apps/mobile) and the full vitest suite (506 tests, incl. the new `lib/selection-map` unit tests) pass. **Native code has NOT been build-verified** — the Swift/Kotlin changes require a device build the user runs.

| Task | Commit | Native build needed? |
|---|---|---|
| 1 — iOS selection (`RubyTextParagraphView.swift`, `RubyTextModule.swift`) | `12cedf42` | Yes (Swift) |
| 2 — Android TextView+spans rewrite (`RubyTextParagraphView.kt`, `RubyTextModule.kt`) | `d39a088b` | Yes (Kotlin) |
| 3 — JS bridge (`RubyText.tsx`, `tokenized-text-spans.tsx`) | `11687024` | — |
| 4 — `TokenizedText` selectionDictionary + `lib/selection-map.ts` (+7 unit tests) | `f3b050e1` | — |
| 5 — `DictionaryPopup` extractPhrases | `896358ed` | — |
| 6 — enable in readers + subtitle transcripts | `e827735a` | — |

**Notable implementation finding (vs spec draft):** this RN version's `Text` has no `onSelectionChange` (TextInput only), so the plain RN-Text path cannot host selection. `selectionDictionary` therefore routes word-replace / phonetics-off contexts through the native paragraph view as well (line box without the reading slot), making the paragraph view the single selection host on both platforms. Byeonggi remains suppressed in selection-enabled selectable paths so native offsets equal `displayTexts` + indent exactly.

**Quick gloss (2026-08-22 change):** quick gloss is **no longer** suppressed in selection-enabled contexts. The native paragraph view (`RubyTextParagraphView` on iOS/Android) renders the gloss as a normal inline run, so its selectable string now contains the ` (‘def’) ` suffix. To keep drag-select offsets correct, `TokenizedText`'s selection map (`lib/selection-map.ts` consumer) reproduces that suffix byte-for-byte for saved, non-highlighted tokens. Consequence: the gloss chars are technically part of the selectable string, so a drag-select that spans a saved word may include the gloss snippet, and the sentence-context fallback for such a selection degrades to the whole block. This matches web's visual placement (inline after a saved word) but diverges from web's `select-none` gloss — mobile can't mark a sub-range of a single native text view as non-selectable. See the `selectionMap` useMemo in `apps/mobile/components/TokenizedText.tsx`.

**Remaining device verification (see Test Plan):** iOS tap-vs-selection arbitration, callout suppression; Android span rendering parity + context-menu suppression; plain-path visual parity; `/extract-phrases` end-to-end; phrase retokenization after saving from a selection.

## Test Plan

- **Unit**: offset mapping (rendered→source: script conversion, phonetics-replace, quiz blank, whitespace runs); Android span advance == canvas advance for identical runs; iOS run→token offset mapping.
- **Manual matrix** (dev/release builds):
  | Context | iOS | Android |
  |---|---|---|
  | Ruby paragraph (ja book) | long-press select → popup; tap still works; no callout | same after Task 2 rewrite; no context menu |
  | Plain path (phonetics off) | select → popup | select → popup |
  | extractPhrases | Phrases cards + pronunciation | same |
  | Supersede | selection closes token popup & vice versa | same |
  | Save from selection | phrase retokenization highlights the saved phrase | same |
- **Regression**: ruby rendering (readings position, line height, saved-word highlight) unchanged on both platforms; reader page-turn pan unaffected.
