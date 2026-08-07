# SPEC-049 — Web → Mobile Feature Parity (since `f0bad902a9`)

## Metadata

- **Spec ID**: SPEC-049
- **Feature**: A running list of user-facing features built on `apps/web` (only) that have **not** yet been ported to `apps/mobile`, since the commit `f0bad902a9` — `feat(mobile): replace Linking.openURL with in-app WebViewSheet for image search`
- **Status**: in-progress (living document — append as new web-only features land)
- **Created**: 2026-08-06
- **ROADMAP Phase**: Phase 4 (Dictionary) / Phase 5 (Content Features) / Phase 6 (User Features)
- **Scope**: `apps/web` → `apps/mobile` (the fresh React Native/Expo 57 port per ADR-0010)
- **Method**: `git log f0bad902a9..HEAD -- apps/web` diffed against `-- apps/mobile`, then filtered to user-facing features
- **Related specs**: [SPEC-032 — EPUB Reader Re-engineering](032-epub-reader-re-engineering.md) · [SPEC-047 — Corpus Tab (Sketch Engine)](047-corpus-tab-sketch-engine.md) · [SPEC-030 — Radix UI Migration](030-radix-ui-migration.md)

## Overview

The web app (`apps/web`) continues to be the feature-velocity driver. Since the
image-search WebViewSheet commit `f0bad902a9`, **292 commits** touched
`apps/web`, of which only **38** also touched `apps/mobile`. This spec tracks
the user-facing web-only features so the mobile team can close the parity gap in
a prioritized order.

Per the project porting rules ([ADR-0010 — Fresh Mobile Port](../adr/0010-port-web-to-mobile-fresh-start.md) · [ADR-0017 — Unified Language Picker](../adr/0017-unified-language-picker.md), and the "Mobile Porting Rules" section of `AGENTS.md`), mobile must eventually match web
feature-for-feature. This document is the inventory to plan against. Features are
grouped by product area; each entry lists the web commits that implemented it and
a mobile status.

## How to use this spec

- **Update this list** whenever a new web-only feature lands (add a row, don't remove).
- **Mark a row `Ported`** only once the feature (or its documented equivalent) is
  actually present in `apps/mobile`.
- The shared packages (`@langplayer/shared`, `@langplayer/api-client`,
  `@langplayer/utils`) already carry most of the types/helpers these features
  need, so most rows are "port the UI, reuse the shared logic".

---

## 1. Dictionary — Search, Autocomplete & Sidebar

Web-only since `f0bad902a9`:

| # | Feature | Web commits | Status |
|---|---|---|---|
| 1.1 | English-definition lookup in dictionary search + autocomplete | `a6231de7`, `e56b97d7`, `876f0224` | **Ported** — mobile `(vocab)/index.tsx` has a debounced autocomplete dropdown (`dict.autocomplete(term, l2, true)`) surfacing English-definition matches |
| 1.2 | Prev/next buttons in the dictionary sidebar header | `5e9f00eb` | **Ported** — mobile `WordListSidebar` header has prev/next |
| 1.3 | Highlight the currently-viewed entry card in the dictionary sidebar | `78c8b725` | **Ported** — mobile `WordListSidebar` wraps the active card with `ring-2 ring-primary` |
| 1.4 | Related-words list surfaced in the entry sidebar (+ hide dead toggles) | `31b607aa` | **Ported (foundation)** — `SidebarSource.wordlist` gained a `source: 'corpus'` origin → "Related" title; sidebar toggle only renders when `isSidebarAvailable`. Actual related-words fetch lands with the Corpus tab (Section 4). |
| 1.5 | Hide the Conjugations tab for languages without inflections | `86c1427f` | **Ported** — mobile `DictionaryEntryTabs` uses `isInflectable(l2)` to omit the tab |
| 1.6 | Shared Radix sidebar primitive across dictionary/reader/epub/web-reader | `c025cdb5` | **Ported (mobile equivalent)** — sidebar built on `@rn-primitives/dialog` `DrawerContent` (slide-from-right), consistent with the app's interaction primitives |

**Notes:** Mobile's dictionary entry screen (`(vocab)/word/[entryId].tsx`) now has
a slide-in sidebar (`WordListSidebar`) fed by `SidebarSource` (search results,
autocomplete suggestions, saved, or future corpus related-words), with prev/next
navigation and current-entry highlighting. The search screen gained a debounced
English-definition autocomplete dropdown, and the Conjugations tab is hidden for
isolating languages. Item 2.x (saved-words entry cards) is tracked in Section 2.

## 2. Dictionary — Saved Words as Entry Cards

The web saved-words sidebar was rebuilt from a plain list into full dictionary
entry cards with rich metadata. Mobile now renders the same tiled entry cards.

| # | Feature | Web commits | Status |
|---|---|---|---|
| 2.1 | Render saved words as full dictionary entry cards | `eb037b50`, `1f9ecee7` | **Ported** — mobile `SavedWordEntryCard` renders each saved word as a compact `DictionaryEntryCard` (lazily enriched via `refreshEntry`) |
| 2.2 | Show saved-word metadata (date/source/context/form) on entry cards | `6e055336`, `a39bbe11`, `b1232785`, `430d089c`, `ec046c31`, `d395edd5` | **Ported** — compact card shows date · source type+title · context sentence |
| 2.3 | Highlight the saved word form in the entry-card save bar | `69c7f31b`, `fb5a93c2`, `913ac385`, `ea20faba` | **Ported** — `HighlightForm` bolds the saved surface form in the context sentence |
| 2.4 | Tile saved-word cards responsively (like explore) | `4f57d584` | **Ported** — saved-words screen tiles cards via a row-based grid (1–4 columns by width) |
| 2.5 | Remove the sort toggle from the saved-words toolbar | `a155f593`, `46a7aae2` | **Ported** — toolbar is filter-only, always newest-first |
| 2.6 | Cap video titles in the entry-card save bar | `b243f825` | **Ported** — `capSourceTitle` (5 words / 15 chars) applied to source titles |

## 3. Dictionary — Image Search (popup + entry)

The web image-search experience went through several iterations (Openverse →
LLM-rewritten → Bing → back to Openverse + LLM polyfill) and gained a rich grid.
The shared **types are in `@langplayer/shared`**, so mobile only needs the UI.

| # | Feature | Web commits | Status |
|---|---|---|---|
| 3.1 | Openverse image search tab in the dictionary | `7a827c74` | **Ported** — mobile `ImageSearchResults` (grid variant) added as an Images tab in `DictionaryEntryTabs` |
| 3.2 | LLM-rewritten image search with filter pills | `f5951ae3`, `7d839a0c` | **Ported** — mobile grid fetches LLM queries via `POST /dictionary/image-queries` and shows query pills |
| 3.3 | Scrollable query pills, paginated grid, query relaxation | `1fb1c689`, `a42d5711`, `d2b91511` | **Ported** — scrollable pills, 3-col paginated grid, query relaxation ladder |
| 3.4 | Skeleton loading states + full-row grid placeholders | `a51690cf` | **Ported** — skeleton pills + grid placeholders while loading |
| 3.5 | Compact image strip in the popup dictionary | `f563f091` | **Ported** — mobile `DictionaryPopup` shows a compact Openverse thumbnail strip |
| 3.6 | Replace Openverse → Bing via Flask → revert to Openverse + LLM polyfill | `5ea5ffb7`, `43dad42b`, `e9d0166f` | Backend/API — mobile consumes the same Openverse + `/dictionary/image-queries` endpoints |

## 4. Dictionary — Corpus Tab (Sketch Engine)

Fully documented in [SPEC-047](047-corpus-tab-sketch-engine.md). Mobile now has a
Corpus tab with all four Sketch Engine pills.

| # | Feature | Web commits | Status |
|---|---|---|---|
| 4.1 | Corpus tab with Sketch Engine pills (Collocations / Examples / Related / Mistakes) | `85eb7be4`, `10fc9ebf`, `cc19a18a`, `9b419715`, `b831dd04`, `60631ee1`, `60ad84db`, `548c33a2`, `5ad757c0` | **Ported** — mobile `CorpusPanel` (pills row) added as a Corpus tab in `DictionaryEntryTabs`; Collocations/Examples/Related/Mistakes sections consume the same `/sketch-engine/*` endpoints |
| 4.2 | Corpus text rendered as interactive tokenized text + term highlighting | `b7afa7a0`, `416357b9`, `e1e077aa`, `d350a874`, `4febef32`, `be6bfbc4` | **Ported** — collocations/examples render via mobile `TokenizedText` (tappable tokens + dictionary popup) with `highlightTerms`; L1 translations via `/translate` |
| 4.3 | Related words as an infinite-scroll card grid with bookmark + corpus source | `f43efb05`, `bb1a9777` | **Ported** — related words render as compact `DictionaryEntryCard`s (lazy entry fetch) that seed the entry sidebar with `source: 'corpus'` |

Use the shared `Sketch*Response` types from `packages/shared/src/types.ts` (added
in SPEC-047) directly — no new API work needed on the backend. Notes: the corpus
picker dropdown is not ported (auto-resolved default corpus is used); Mistakes is
zh-only as on web.

## 5. Dictionary — AI Explain (DeepSeek)

| # | Feature | Web commits | Status |
|---|---|---|---|
| 5.1 | Embed pro-gated DeepSeek explanation in the full entry card | `aa938b30`, `f3dce79f`, `eea1eed1`, `d1df2dec` | **Ported** — mobile entry DeepSeek tab + popup embed Pro-gate via `useSubscription` |
| 5.2 | Interactive tokenized L2 strings in AI explain responses | `dab49f8c` | **Ported** — new mobile `MarkdownExplanation` renders backticked L2 spans as interactive `TokenizedText` once streaming finishes; prompt appends `prompt.explain_ticks` |
| 5.3 | Ask DeepSeek for two same-sense usage examples | `9659e1b8` | **Ported** — `prompt.explain_word` already asks for "2 examples with translations" |
| 5.4 | Show "Let AI Explain" instantly + share subscription status app-wide | `e7cc6246` | **Ported** — button + Pro gate present; autoLoad streams instantly for Pro users |

## 6. Review (flashcards)

| # | Feature | Web commits | Status |
|---|---|---|---|
| 6.1 | Show phonetics on highlighted words; reveal on review-card flip | `a31015f4`, `5fb47ebb` | **Ported** — mobile `TokenizedText` gained `phoneticsOnHighlight`; the review context passes `phoneticsOnHighlight={showTabs}` so phonetics appear on the highlighted word after flip |
| 6.2 | Emphasize target form in review translation + render markdown | `a0fb8992`, `0d3df109` | **Ported** — review translation renders the target form in primary color (echoed leading form stripped) and shows the auto-translated context translation that was previously fetched-but-hidden |
| 6.3 | Halve review-card padding on phones, localize source dates | `ad52ca3c`, `28e01935` | **Ported** — mobile card already uses phone padding; `SavedWordSource` gained a `locale` prop and the review passes the L1 locale |
| 6.4 | Remove tap-to-rate zones from the review card | `42a235d3` | **Ported** — mobile review card has no tap-to-rate zones (rating is via the explicit bottom buttons only) |

## 7. Subs-Search & Player Translation Display

| # | Feature | Web commits | Status |
|---|---|---|---|
| 7.1 | Text action menu + translations on subs-search subtitles | `48a4ab92`, `ffcd83ac` | **Ported** — mobile subs-search subtitle is wrapped in `TextActionMenu` (copy/speak/AI explain/translate); translations already stacked via `SimpleSubsForDebug` |
| 7.2 | Always stack the subs-search translation below the subtitle | `be6326bc`, `a2439ca1` | **Ported** — `SimpleSubsForDebug` renders the L1 translation below the active subtitle |
| 7.3 | Send target form to the translate API instead of pre-marking text | `faabb254`, `10f0ae7a`, `09d52d97` | **Ported** — `useSubtitleTranslation` gained `highlightForms` and sends per-line `forms` to `/translate_array`; `SimpleSubsForDebug` passes the matched highlight term per line |
| 7.4 | Specific translated YouTube player errors | `3345cb39` | N/A on native — YouTube player errors come from the native webview/player |
| 7.5 | Progressive SPEC-029 caption normalization | `5b0f9950` | Backend — server-side caption normalization; mobile consumes normalized captions |

## 8. Native Text Selection & Selection Actions

React Native has no `window.getSelection()` — native text-selection actions
(8.1–8.3) are web-only. The mobile equivalent is TokenizedText's **tap-to-lookup**
dictionary popup, which opens directly on word tap (no action menu).

| # | Feature | Web commits | Status |
|---|---|---|---|
| 8.1 | Native text-selection actions on `TokenizedText` | `f8933c22`, `b5ed5433` | N/A on native — RN has no `getSelection`; tap-to-lookup is the interaction model |
| 8.2 | Selection opens the dictionary popup (instead of the action menu) | `8bcbf886` | N/A on native — mobile token tap opens the dictionary popup directly |
| 8.3 | Canonical phrase cards in the selection dictionary popup | `4dda1406`, `09f99c08`, `4dda1406` | N/A on native — same as 8.2 |
| 8.4 | Pass the immediate sentence as selection popup context | `9263d87a` | **Ported (equivalent)** — mobile TokenizedText now passes the line text as `context` to its dictionary popup (biases AI explanation + translations) |

## 9. EPUB Reader & Bookshelf

Mobile has a **basic** single-file EPUB reader (`(reading)/epub.tsx`: upload,
cover, chapter sidebar, pagination). The web EPUB experience is substantially
richer (SPEC-032) and is web-only:

| # | Feature | Web commits | Status |
|---|---|---|---|
| 9.1 | Whole-book model re-engineering of the EPUB reader | `78134763` (SPEC-032) | Deferred — mobile keeps the single-file reader model |
| 9.2 | Per-book EPUB bookshelf with reading progress | `af91c627`, `204130ba`, `1bd69f54`, `d4af42e6` | Deferred — `useEpub` persists a single book + position; multi-book library is future work |
| 9.3 | Language-specific EPUB bookshelf | `d7c987f8` | Deferred — depends on 9.2 |
| 9.4 | In-book search with snippets + chapter navigation | `cec93152`, `f32df70d` | **Ported** — new `BookSearchDialog` searches the current chapter's text blocks with highlighted snippets |
| 9.5 | Highlight EPUB search matches in the reader | `7f11764f`, `e4920f2e` | **Ported** — search results highlight the term and jump to the matching page (`blockPage` added to `use-epub-pagination`) |
| 9.6 | Open EPUBs straight to content + page-number estimates | `08f95227`, `4de9a652` | Partial — mobile restores the last-read position (anchor) on open; page-number estimates N/A |
| 9.7 | In-book back history + in-content link fragments | `3a18d4bf` | Deferred — chapter sidebar has prev/next; full back-history stack is web-only |
| 9.8 | Dictionary popup spawned from clicked token / internal links | `e7ca8271`, `39f085f9` | **Ported** — mobile reader renders via `TokenizedText` (tap-to-lookup dictionary popup); internal links N/A (no hyperlinks in the simplified mobile reader) |

## 10. Web Reader (article/text) — `apps/web` only

The web reader is a separate feature from the EPUB reader. Mobile has a
`(reading)/web-reader.tsx` screen, but the web version has significantly more:

| # | Feature | Web commits | Status |
|---|---|---|---|
| 10.1 | Curated reading suggestions + markdown formatting | `c2c21453` | Not in mobile |
| 10.2 | Sync reader URL to the browser address bar | `6dffd845` | Not in mobile (N/A on native) |
| 10.3 | Sniff page title / tracked visited sites + visit date | `4dc92ca8`, `1db5bc86`, `1e708204` | Not in mobile |
| 10.4 | Open reader links in-app + back-to-home button | `47a42ef5`, `ff3e8e62`, `cda9d465` | Not in mobile |
| 10.5 | Hide edit/read mode tabs | `c25280a5` | Web-only filter |
| 10.6 | Cap text-source titles in the save bar | `7908cd37` | Not in mobile |
| 10.7 | Clickable chevron links | `5f94d5a2` | Not in mobile |

## 11. Quick Gloss & Translation Styling

| # | Feature | Web commits | Status |
|---|---|---|---|
| 11.1 | Restyle quick gloss with parens and smart spacing | `a793418c` | Not in mobile |
| 11.2 | `TokenizedText` respects the text-scaling setting everywhere | `03ea9b55` | Not in mobile |

## 12. Language Picker & Branding (shared/fundamental)

These are shared or infra-oriented; mobile already received most of them
(shared primary-color token `f37fd9e6`, language-picker parity `e220b637`,
auth flows). The row-API work (`50fa43b7` web vs `fe22b900` mobile) is also in
place on both. No porting action required for this bucket — included for completeness.

| # | Feature | Web commits | Mobile status |
|---|---|---|---|
| 12.1 | Brand primary-color switch to brand purple | `f37fd9e6` | **Ported** (shared token) |
| 12.2 | Language picker polish + instant UI retranslate on L1 change | `e220b637` | **Ported** (ADR-0017) |
| 12.3 | Show L1 self-names in the language picker | `742bed0a` | Pending check |

---

## Not included

Excluded from the inventory as **not user-facing parity items**:

- **Chore/refactor/perf/style/debug** commits (e.g. `252657a7` Turbopack,
  `bd5089d6` Next 16, `c5c196f3`/`6f507641` Radix migration, `e8f1057e` token
  refresh — mobile already tracks this via `fe07cf02`, `43dad42b`, `d486f3e5`,
  various `style(web)`/`fix(web)` alone).
- **Auth flows** (password-recovery, confirmation fragments, auto-login from
  links) — mostly web/infra; mobile parity is a separate concern from the
  feature inventory (`f6a8d330`, `969f4028`, `419896cc`, `fbdd4a27`, `0e58417c`,
  `b1308b04`).
- **Row-API progress/SRS/settings** — web `50fa43b7` mirrors mobile `fe22b900`.
- Web-only **i18n of plan cards** on go-pro/profile (`24f7d3e5`, `56f529f9`) —
  string-level, low priority.

## Suggested porting priority

1. **Corpus tab (Section 4)** — biggest dictionary gap; shared types exist, UI only.
2. **Image search grid (Section 3)** — replaces the WebViewSheet stand-in.
3. **Saved-words entry cards (Section 2)** — high-visibility dictionary UX.
4. **AI Explain in entry card (Section 5)**.
5. **EPUB bookshelf + in-book search (Section 9)** — large but self-contained.
6. **Subs-search translations + review phonetics (Sections 6–7)**.
7. **Web reader suggestions/visited sites (Section 10)**.

## Open Questions

- Should the native **WebViewSheet** image search (the commit `f0bad902a9` that
  anchors this range) be replaced by the native grid, or kept? Decisions here
  affect Section 3 scope.
- Mobile currently uses a **single-file** EPUB reader. Do we port the whole-book
  bookshelf model, or is per-device rendering enough for v3?
- The list should be revisited at each mobile release to mark rows **Ported**.
