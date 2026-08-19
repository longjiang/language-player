# Feature Specification: Mobile–Web Parity — Reader, Subs Search, SRS Sync (2026-08 web cluster)

## Metadata
- **Spec ID**: SPEC-082
- **Feature**: Port the 2026-08-16/17 web feature cluster (readers, subs search, subtitle modes, SRS sync hardening) to `apps/mobile/`
- **Status**: complete
- **Created**: 2026-08-17
- **Completed**: 2026-08-18 (all 17 tasks executed, each committed separately)
- **ROADMAP Phase**: Mobile parity — Reading / Media / Vocab

## Overview

Between SPEC-077 and SPEC-081 the web app shipped a feature cluster touching
readers, subs search, subtitle display, display settings, and SRS sync
(commits `a42039b6`…`a38bab51`). None of it touched `apps/mobile/` (mobile's
last touch to the affected files was 2026-08-16), so mobile is one cluster
behind. This spec plans bringing mobile up to date.

A three-way gap analysis (web diff × mobile source × shared types) was
completed first. Key finding: mobile is **not** a blank slate — it already has
a shared `PaginatedReader`, a full EPUB pipeline, subs search with a list-all
modal and per-line text action menus, band subtitle mode, and a durable SQLite
sync outbox (SPEC-053). The genuinely missing work is listed below, each item
tagged with its web reference commit(s).

Two shared settings (`TokenizedTextSettings.translationSize`, default 0.8, and
`DisplaySettings.translationSplit`, default 0.6) were added to
`packages/shared/src/types.ts` in this cluster. Because mobile builds its
settings state through the shared `createSettingsV2()`/`normalizeSettingsV2()`
defaults (`apps/mobile/hooks/use-settings.ts`), **both fields already exist in
mobile's persisted and cloud-synced settings blob** — no migration needed. The
work is UI + consumers only.

**Not in scope (already on mobile, or web-only):** band subtitle mode +
click-to-seek (A1), watch-page transcript↔subtitles toggle, list-all modal with
lazy translations, per-line text action menu, traditional/simplified glyph
preference (via `useScriptPreference` + OpenCC), the web `VideoSidebarPanel`
refactor (internal, no behavior gap), CSS baseline alignment, hover
interactions, and CSS-column pagination (SPEC-077 explicitly declares CSS
multicol a web-only mechanism; mobile keeps its measurement-based reader).

## User Stories

- As a mobile reader user, I want translation text sized relative to the L2
  text (configurable), so long-form reading stays comfortable.
- As a mobile subs-search user, I want the same list, filter, grouping, and AI
  sort tools the web has, so my study workflow doesn't depend on which device
  I use.
- As a user with multiple devices, I want my SRS unsave to never destroy a
  rating I made on another device, even when I was offline.

## Source Commits (web reference)

| Cluster | Commits |
|---|---|
| Reader | `a42039b6`, `06cc9286`, `d7523b34`, `d9de10ac`, `b27d733b`, `8bc77600`, `f31fcda2`, `aee18288`, `7fa2ca58`, `45e4fd35`, `f9f5b91d`, `4a55690d` |
| Subtitle modes | `b99022b3`, `2b9fc4d3`, `71c112f2`, `97238b53`, `921f0ff3` |
| Subs search | `f5dc723b`, `20af286e`, `ab40b8d3`, `e6fb2ffa`, `d21887b3`, `2b92f317`, `bcaae5cf`, `5cb659a1`, `8291280a`, `52d7f11f`, `d57f7c5f`, `cea2b5e2`, `aaf8f5ee`, `92177028`, `6070f10c`, `3a5eaa6b`, `5968a715`, `6a0a273e`, `d29c51dc`, `6dcf127b`, `b9005d09`, `ce06981a`, `a38bab51` |
| SRS / settings | `74087ef0`, `4c68c8b4` (+ shared type changes from `7fa2ca58`, `f31fcda2`) |

---

## Task 1 — Translation-size ratio rendering (reader + subtitles)

- **Web ref**: `8bc77600`, `7fa2ca58`; web helper `apps/web/src/lib/reader-text-size.ts` (`TRANSLATION_FACTOR = 0.8`, `clampTranslationSize`, clamp bounds 0.5–1).
- **Mobile state**: translations hardcoded at `fontSize: 14 * blockScale` (`components/reader/PaginatedReader.tsx:681`), `14 * 1.5 * zoomRem` (singleline, `components/video/SubtitleDisplay.tsx:237`) and `14 * zoomRem` (multiline, `SubtitleDisplay.tsx:307`).
- **Plan**:
  1. Add a small shared helper (see Shared Logic section): `clampTranslationSize(f)` and `translationSizeFactor(settings)` in `packages/utils/src/` (or a new `reader-text-size.ts` there), re-exported from `packages/utils` index. Web should eventually consume the same helpers (follow-up, non-blocking).
  2. `PaginatedReader.tsx:681` — translation font size = `translationSize * L2FontSize` where L2FontSize is the block's rendered size (mobile uses `blockScale`/`zoomRem` already; multiply the factor in).
  3. `SubtitleDisplay.tsx:237, 307` — same ratio applied to the singleline and multiline translation `Text` styles.
  4. Read the setting from `useSettingsContext().tokenizedText.translationSize` (already typed; default 0.8).
- **Edge cases**: factor clamped to [0.5, 1]; heading blocks in the reader scale by heading depth (web derives `text-2xl/xl/lg × zoom`; mobile should apply the same factor to its heading translation size — currently one hardcoded size).
- **Test**: render a reader block + subtitle line with factor 0.5 and 1.0; assert translation size scales, L2 size unchanged.

## Task 2 — Translation Size slider in mobile display settings

- **Web ref**: `7fa2ca58`; web settings page `apps/web/src/app/[l1]/[l2]/settings/display/page.tsx` (slider 50–100%, step 0.05, drives `updateTokenizedText({ translationSize })`, live preview).
- **Mobile state**: `app/(tabs)/(me)/settings/display.tsx` has Text Size and Leading sliders only (lines 149–170); `SettingsContext.updateTokenizedText` exists and can write the field.
- **Plan**:
  1. Add a `SliderRow` "Translation Size" (50–100%) below Text Size in `app/(tabs)/(me)/settings/display.tsx`, mirroring the web's min/max/step/`valueDisplay` (`${Math.round(f*100)}%`).
  2. Wire `onValueChange → updateTokenizedText({ translationSize: clamp(v) })`.
  3. If the settings screen shows a translation preview, size it with the factor (web does); otherwise leave preview as-is.
- **Test**: change slider → persisted in `settings_v2` (cloud sync round-trip), reader/subtitle translations rescale after re-render.

## Task 3 — Resizable text|translation splitter in the mobile reader

- **Web ref**: `f31fcda2`, `aee18288`; web `apps/web/src/components/reader/translation-split-handle.tsx` (pointer capture, ratio from cursor x, commits to `display.translationSplit` on release) wired through `text-action-menu.tsx` and `reader-panel.tsx`/`epub-reader-panel.tsx` (`l2Grow = split`, `trGrow = 1 - split`).
- **Mobile state**: side-by-side rows use fixed `flex-[3]`/`flex-[2]` at `components/reader/PaginatedReader.tsx:693-694, 703-704, 722-723` (paragraph, blockquote, heading) plus the measuring mirror (`:905-908`).
- **Plan**:
  1. Add a `TranslationSplitHandle` component in `components/reader/` using `react-native-gesture-handler` `Pan` (already used for page swipes): `onStart` capture x, `onUpdate` compute `(x - rowLeft)/rowWidth` clamped to [0.3, 0.7] (web's exact bounds: `translation-split-handle.tsx:27-28, 45`), `onEnd` persist via `updateDisplay({ translationSplit })`.
  2. `PaginatedReader.tsx` — replace the three hardcoded flex ratios with `{ flex: translationSplit }` / `{ flex: 1 - translationSplit }` from `useSettingsContext().display.translationSplit` (default 0.6 = legacy 3:2).
  3. Render the handle only when `translationSideBySide` is active and width ≥ the side-by-side breakpoint (mobile uses `useResponsive`/`useWindowDimensions`; match the existing threshold in `PaginatedReader`).
  4. Keep the measuring mirror in sync (same split applied to the mirror's side-by-side rows) so pagination math matches rendered layout.
- **Edge cases**: drag while page metrics are being measured (mirror must not remeasure mid-drag — web guards this); split changes must not invalidate token/translation caches (web keeps caches keyed by block, not width).
- **Test**: drag handle → L2/translation widths change 1:1 with cursor; release → split persists across reload; pagination page-breaks don't shift after split change.

## Task 4 — Translation-sentence highlight on tap (reader)

- **Web ref**: `d7523b34`; web `apps/web/src/lib/sentence-map.ts` (`segmentSentences`, `buildSentenceMap`, `sentenceIndexAt`, ~136 lines pure TS) + `apps/web/src/components/reader/sentence-highlight.tsx` (hover interaction).
- **Mobile state**: nothing — no sentence map, no tap-highlight.
- **Plan**:
  1. **Shared logic first**: move `sentence-map.ts` into `packages/utils/src/sentence-map.ts` (pure TS, no React/DOM), export from the package index, update the web import to consume it from the package (delete the web-local copy). Add tests (port web's tests if present).
  2. `components/reader/PaginatedReader.tsx` — on token tap (existing `TextActionMenu`/token press path), compute the sentence index of the tapped token via `sentenceIndexAt`, mark the paired translation sentence range; render it highlighted (background tint) until the selection clears.
  3. Because there's no hover on touch, the highlight is tap-to-toggle: tap a token → highlight its translation sentence; tap elsewhere / scroll → clear.
- **Edge cases**: sentence alignment failure → `null` (render plain translation, no crash); proportional alignment when sentence counts differ; punctuation sets already in the module handle L2 scripts.
- **Test**: unit tests for `sentence-map.ts` (ported from web); manual: tap token in a JP paragraph → correct translation sentence highlights.

### Implementation status

Implemented at `b83da08e`. **Follow-up fix (local/global keying)**: the initial
tap handler looked up the tapped block's translation with `blockTranslations[globalIdx]`,
but `use-epub-pagination` keys translations by the block's **local** index within the
current page's text blocks (reset on every page) — so the highlight only worked when
global and local indices coincided (first page with no preceding non-text blocks). The
handler now resolves the local index the same way `renderBlock` does, via
`apps/mobile/lib/reader-sentence-highlight.ts` (`isReaderTextBlock`, `localTextBlockIndex`,
unit-tested), so the tap-highlight works in every reader (Notes/Web reader/EPUB/tokenizer
test) on every page.

## Task 5 — EPUB fresh page per spine doc + Japanese first-line indent

- **Web ref**: `45e4fd35` (fresh page), `4a55690d` (indent, `[&_p]:indent-[1em]` in `epub-reader-panel.tsx`).
- **Mobile state**: EPUB model is **flat** — `lib/epub-book.ts` concatenates spine items into one global `blockIndex` list (spine data kept only as `spineHrefs`/`chapterLabels` for links/TOC); `hooks/use-epub-pagination.ts` page-breaks purely by height (`accumulated + cost > availableHeight`). A chapter can start mid-page.
- **Plan**:
  1. `lib/epub-book.ts` — carry a `spineIndex` (or `startsNewSpine: boolean`) on each block (or expose a per-spine boundary map keyed by global block index). Keep the flat list for compatibility; add metadata, don't restructure callers yet.
  2. `hooks/use-epub-pagination.ts` — a block flagged `startsNewSpine` is a hard page start: it begins a new page even if it would fit on the current one (web: `startsNewSpine()`/`computeForwardEnd()`/`computeBackwardStart()` in `use-paginated-reader.ts`).
  3. `components/reader/PaginatedReader.tsx` — apply first-line indent to body paragraph blocks when rendering an EPUB (a `contentIndent`/`firstLineIndent` prop or block flag), matching `indent-[1em]`.
  4. Verify progress/resume (`BookLocation`) still maps correctly with the new hard breaks (location is block-index based; only page boundaries change).
- **Edge cases**: spine boundary + block that also exceeds page height alone (hard break is a minimum, not a maximum); images at spine boundaries; resume mid-chapter.
- **Test**: two-chapter fixture EPUB → chapter 2 title always starts at the top of a page; JP paragraph first line indents; resume position still accurate.

## Task 6 — Subs search: content filter pills (SPEC-079)

- **Web ref**: `2b92f317`; web pills All / Non-Music / Music / TV Shows next to the forms toggle; music = `category` 10|24, TV = non-falsy `tv_show`; shared type `SubsSearchVideo` gained `category?: number | null`, `tv_show?: number | null` (`packages/shared/src/types.ts:99-102`).
- **Mobile state**: `components/video/SubsSearchResults.tsx` maps the fetch via `(v: any)` at `:248-266` and **drops both fields**; nav bar has no pills (`:506-543`).
- **Plan**:
  1. Map `category: Number(v.category) || null` and `tv_show: Number(v.tv_show) || null` in the fetch mapping (match web `subs-search-results.tsx:650-651`).
  2. Add the four pills to the nav bar row (reuse the existing pill/segmented pattern mobile already uses for the forms toggle); filter client-side over `videos` before list/player use: music = `category === 10 || 24`, nonMusic = excludes those, tvShows = `tv_show != null`.
  3. Keep the filter applied to the player queue array (single filtered array drives list + prev/next — see Task 9).
- **Test**: seed results with category 10/24 videos → Music pill shows only those; TV Shows pill only `tv_show` rows; queue follows the filtered set.

## Task 7 — Subs search: show only the matched line in rows

- **Web ref**: `bcaae5cf`; web row emits only the match segment (`rowSegments`).
- **Mobile state**: rows show prev+match+next context segments (`SubsSearchResults.tsx:161-179`, rendered `:461-488`).
- **Plan**:
  1. Change the row renderer to emit only the matched segment (keep the timestamp badge).
  2. Match web `HighlightTerms` fidelity: prefer the **longest** matching term on ties (web `subs-search-row.tsx:61-100`); mobile currently highlights only the first form (`:65-77`).
- **Test**: inflected-term search highlights the full inflected form; rows show one line only.

## Task 8 — Subs search: sort/filter toolbar + queue follows list

- **Web ref**: `cea2b5e2`, `aaf8f5ee`, `92177028`, `c64299e2`, `d21887b3`; web `applyFilterAndSort` (`subs-search-results.tsx:141-230`) and `filteredVideos` driving both list and player queue.
- **Mobile state**: no toolbar; list is a plain `FlatList` in a Dialog (`:425-495`); queue follows the unsorted array trivially.
- **Plan**:
  1. Add a sort control to the list (mobile `SortKey`: views / likes / date / length / leftContext / rightContext — AI sort is Task 10). Reuse `formatTime`/ISO parsing (Task 11) for `length`.
  2. Extract the filter+sort pipeline into a pure helper (see Shared Logic: `contextChar` + sort comparator) so web and mobile share it.
  3. Single `filteredVideos` array drives FlatList data AND the player's prev/next + index clamp (mirror web `:467-483, 698-754`).
- **Test**: sort by length changes list order and the player's next/prev follows it; switching sort resets nothing stale.

## Task 9 — Subs search: context-group headers, collapsible groups, Collapse/Expand All

- **Web ref**: `8291280a`, `52d7f11f`, `d57f7c5f`, `cea2b5e2`, `aaf8f5ee`; web groups by `contextChar` (char before/after the term, `subs-search-results.tsx:102-122`), renders headers with counts, collapse/expand per group + bulk (Collapse All / Expand All), groups sorted largest-first, first-group count shown after the bulk buttons.
- **Mobile state**: nothing.
- **Plan**:
  1. Extract `contextChar` into shared logic (see Shared Logic) so web/mobile group identically (handles comma-separated inflected forms — web `b9005d09`).
  2. `SubsSearchResults.tsx` — when the sort is left/right-context, render `SectionList`-style grouped rows: header row per group (boundary char + count), tap to collapse/expand (per-group state, reset on sort change — web resets collapsed state per sort).
  3. Add Collapse All / Expand All buttons on the first group header; show the first-group count after them.
  4. Groups ordered largest-first; stable within-group order.
- **Test**: leftContext sort groups by preceding char; collapse/expand state resets when sort changes; counts correct.

## Task 10 — Subs search: Sort by AI grouping (SPEC-081) + spinner/retry

- **Web ref**: `3a5eaa6b`, `7a188cfa`, `d29c51dc`, `6dcf127b`, `a38bab51`, `b9005d09`; web `apps/web/src/lib/subs-ai-grouping.ts` (pure TS: CSV payload build, prompt, `parseAiResponse` with `sanitizeJson`/`extractJsonObject` for unescaped quotes, `buildAiOrderedVideos`).
- **Mobile state**: nothing. `POST /chatgpt` is already reachable from mobile (`useStreamingExplanation`).
- **Plan**:
  1. **Shared logic first**: move `subs-ai-grouping.ts` into `packages/utils/src/subs-ai-grouping.ts` (pure TS, no React/Next imports — verified), export from index, update web import. Port its tests.
  2. Add `'ai'` to mobile `SortKey`; on selection, snapshot the top 50 filtered videos, build the CSV payload via the shared builder, POST `{ prompt, cache: true }` to `/chatgpt`, parse+validate via shared `parseAiResponse`.
  3. Render pattern groups → Other Patterns → Other (shared `buildAiOrderedVideos`); reuse the Task 9 collapsible group UI.
  4. Show the "AI analyzing" spinner row below the toolbar while in flight, with retry on failure (web `belowToolbar` status row).
  5. Cache parsed results client-side keyed by `l2 + term + first-50 ids` (web caches the same way; server `/chatgpt` cache is second layer).
- **Edge cases**: LLM returns trailing garbage / unescaped quotes (handled by shared sanitizers); hallucinated ids dropped; videos beyond 50 → Other in original order; filter pills applied on top of grouping.
- **Test**: ported unit tests for `subs-ai-grouping.ts`; manual: AI sort on a JP term groups by pattern, spinner shows, retry works.

## Task 11 — Subs search: ISO 8601 duration parsing

- **Web ref**: `6070f10c`; web `durationToSeconds()` (`subs-search-results.tsx:127-139`) converts "PT6M52S".
- **Mobile state**: raw `v.duration` passthrough (`:257`); a string would break mobile `formatTime`'s `Math.floor` → "NaN:NaN". Duration never displayed (only `formatTime(ml.starttime)` for the timestamp badge).
- **Plan**:
  1. Add `durationToSeconds()` to shared logic (see Shared Logic), use it when mapping the fetch so `duration` is always a number.
  2. Display duration in the list rows and/or info (mobile currently lacks the info tab — display duration in rows where web shows it; exact placement per the list-first layout in Task 13).
- **Test**: "PT6M52S" → 412; missing/undefined duration → 0 or hidden; no NaN rendering.

## Task 12 — Subs search: never autoplay + cue at match line via `startTime`

- **Web ref**: `ce06981a`; web `autoplayEnabled` constant false; video cues paused at the match line via `startTime`.
- **Mobile state**: autoplays on navigation — `autoplayEnabled` set true in `selectFromList` (`:346-350`) and prev/next handlers (`:583-584`); 600 ms seek-and-play effect (`:283-296`); `YouTubePlayer` supports `startTime` (`components/video/YouTubePlayer.tsx:52,206`) but mobile never passes it.
- **Plan**:
  1. Make autoplay a constant `false` (keep it as a config constant so it can be revisited).
  2. Pass `startTime={matchLineStartTime}` (the matched line's `starttime` seconds) to `YouTubePlayer` so the initial cue is at the match line, paused.
  3. Remove the seek-and-play effect and the autoplay flips in `selectFromList`/prev/next handlers.
- **Test**: selecting a result cues the video at the match line, paused; prev/next also cue at the new video's match line, paused; play only starts on explicit user action.

## Task 13 — Subs search: list-first layout

- **Web ref**: `f5dc723b`, `20af286e`; web flips to nav bar → list (default surface, `max-h-[70vh]`) → playback opens in a `max-w-2xl` modal.
- **Mobile state**: player-first with the list hidden in a Dialog (`SubsSearchResults.tsx:500-633`).
- **Plan**:
  1. Flip the layout: results list is the default surface (top of the subs-search panel), with the toolbar + filter pills + sort (Tasks 6/8/9/10) above it.
  2. Tapping a row opens playback in a modal (bottom-sheet on narrow / centered on md+ — mobile already has the dialog primitives; reuse the existing Dialog).
  3. The modal contains the player + `VideoControlBar` + singleline `SubtitleDisplay` + (multiline mode) tabbed sidebar — see Task 15.
- **Test**: fresh search shows the list immediately; row tap opens the player modal; back closes it without resetting the list.

## Task 14 — Subs search: remove Watch button + "videos matching" header

- **Web ref**: `ab40b8d3` (Watch moved into the modal's info tab), `e6fb2ffa` (header dropped).
- **Mobile state**: both still present — Watch in the nav bar (`:529-535`), `t('msg.videos_matching', …)` dialog header (`:418`).
- **Plan**:
  1. Remove the Watch button from the nav bar (its function — opening the watch page for the current video — moves into the playback modal, matching web).
  2. Remove the "N videos matching …" header from the list.
- **Test**: nav bar shows forms toggle + pills + list controls only; list has no header row.

## Task 15 — Subs search: singleline↔multiline toggle + multiline tabbed sidebar

- **Web ref**: `2b9fc4d3`, `71c112f2`, `921f0ff3`; subs search gained `subtitleMode` state (default singleline); toggle moved into `VideoControlBar` via `onTogglePanel`/`panelOpen`; multiline mode shows a tabbed `VideoSidebarPanel` (subs | queue | info); singleline shows bare display only; the list-all modal is independent of mode.
- **Mobile state**: `VideoControlBar` already supports `onTogglePanel`+`panelOpen` (`components/video/VideoControlBar.tsx:28-30, 153-161`) and the watch page wires it — but `SubsSearchResults.tsx` renders `SubtitleDisplay` always `singleLine` (`:596`) and passes no toggle props (`:574-590`). No `subtitleMode` state exists.
- **Plan**:
  1. Add `subtitleMode: 'singleline' | 'multiline'` state to `SubsSearchResults` (default singleline, matching web).
  2. Pass `onTogglePanel`/`panelOpen` to the subs-search `VideoControlBar`; toggle flips the mode (PanelRightOpen/Close icons — mobile control bar already renders these for the watch page).
  3. singleline mode → bare `SubtitleDisplay singleLine` only.
  4. multiline mode → render the multiline `SubtitleDisplay` inside a tabbed panel with queue + info tabs (mirror the watch page's `TranscriptQueuePanel` structure — mobile already has `TranscriptQueuePanel` + `VideoQueueList`; reuse them rather than introducing `VideoSidebarPanel`).
  5. Keep the list-all modal independent of mode (already true).
- **Test**: toggle icon flips between single line and full transcript + tabs; queue tab lists the filtered/sorted results; info tab shows video metadata (duration per Task 11).

## Task 16 — Subs search: extract `SubsSearchRow` component

- **Web ref**: `5cb659a1`; refactor into `apps/web/src/components/video/subs-search-row.tsx`.
- **Mobile state**: inline row in the FlatList `renderItem` (`SubsSearchResults.tsx:434-494`).
- **Plan**:
  1. Extract `components/video/SubsSearchRow.tsx` (thumbnail, matched line, timestamp, lazy translation trigger) mirroring the web component's responsibilities.
  2. Keep the row's props focused: video + matched line + callbacks; the parent owns list state, grouping, and the player queue.
- **Test**: no behavior change — row renders identically before/after extraction (visual + interaction check).

## Task 17 — SRS: fix stale-delete guard on the mobile `/sync/push` path

- **Web ref**: `74087ef0` (ADR-0040) — web-facing `DELETE /srs/cards?updatedAt=` drops a delete when the row was written more recently (server `routes/user_data_columns.py:264-291`, `utils_user_data.py:319-343` `delete_srs_card(client_ts)`).
- **Mobile state**: mobile's SQLite outbox (`lib/sync-db.ts` + `lib/sync-engine.ts`) already covers lossless flush, cap drop, and undo-LWW. **Gap:** the push path bypasses the stale-delete guard — `_h_srs_card` in `zerotohero-python-server/utils_sync.py:236-245` calls `delete_srs_card(conn, user_id, l2, word_id)` with **no client timestamp**, ignoring the op's `updated_at` (available at `apply_push_op`). Mobile's delete payload also omits `updatedAt` (`hooks/use-srs.ts:184-192`). A delete queued on mobile while another device rates the card can destroy the newer row.
- **Plan**:
  1. **Server (primary fix)**: `utils_sync.py` `_h_srs_card` — pass the op's `updated_at` through: `delete_srs_card(conn, user_id, l2, word_id, client_ts=updated_at)`. Verify `apply_push_op` forwards `updated_at` into the handler (report says it does, line 413) and confirm the `delete_srs_card` signature accepts the timestamp (web route already uses it).
  2. **Mobile (defense in depth)**: include `updatedAt` in the delete op payload in `hooks/use-srs.ts` (`removeCard`, `:184-192`) so the push payload carries it even if the server handler is later changed.
  3. Add a server test (or extend existing): delete pushed with old `updated_at` vs a newer row's `updated_at` → delete dropped.
- **Edge cases**: legacy outbox rows without `updated_at` (default to now — same as web's behavior); delete of a card that was never created server-side (no-op).
- **Test**: two-device simulation — device A queues delete, device B rates the card, A's sync flushes → card survives; then A's delete with a newer timestamp → card deleted.

## Task 18 — Subs search + AI examples: watch-page modal layout on wide screens in multiline mode

- **Web ref**: subs-search playback modal shows subtitles on the side and video info below the player on wide (landscape) screens in multiline mode, mirroring the watch page — inside the modal: modal widens to `sm:max-w-5xl`, content becomes a `grid-cols-[minmax(0,1fr)_320px]` (player + controls + info left, subs transcript right), and the sidebar's info tab is dropped on wide (info lives below the player).
- **Implementation** (shared component, web + mobile): the playback modal is extracted once per platform into `SubsSearchPlaybackModal` (`apps/web/src/components/video/subs-search-playback-modal.tsx`, `apps/mobile/components/video/SubsSearchPlaybackModal.tsx`) and used by **both** the subs-search result rows and the "Let DeepSeek Explain" example chips — same component, same behavior, same modal.
  - The web modal renders through a **portal to `document.body`**, so it always sizes against the viewport even when opened from the dictionary popup (whose `DialogContent` centering transform would otherwise trap a `position: fixed` child at the popup's 28rem width — the "so narrow there's no space for subs on the side" bug).
  - The mobile modal renders through the native `Dialog.Portal` (bottom sheet on narrow, centered dialog on md+), widened to `max-w-4xl` on wide+multiline.
  - Both keep every existing behavior: singleline | multiline toggle, subs/info (web) and transcript/queue/info (mobile) sidebars, prev/next queue following the passed `videos` order, video info below the player on wide, "Load Full Subtitles" out-of-range notice (subs-search only, via optional props), and the embed-failure auto-skip (subs-search only, via `onVideoError`). The subs-search singleline/multiline choice still persists to `lp_subs_search_subtitle_mode`.
- **Test**: open an AI example chip → toggle multiline → rotate to landscape: subtitles appear beside the player with info below it; rotate back to portrait: subtitles return below the player with the info tab restored.

---

## Shared Logic (move to `packages/` per AGENTS.md "share logic, not views")

| Module | From | To | Used by tasks |
|---|---|---|---|
| `sentence-map.ts` (pure TS, ~136 lines) | `apps/web/src/lib/` | `packages/utils/src/sentence-map.ts` | 4 |
| `subs-ai-grouping.ts` (pure TS: payload/prompt/parse/build) | `apps/web/src/lib/` | `packages/utils/src/subs-ai-grouping.ts` | 10 |
| `durationToSeconds()` | embedded in `apps/web/src/components/video/subs-search-results.tsx:127-139` | `packages/utils/src/` | 11 |
| `contextChar()` + sort comparator | embedded in `apps/web/src/components/video/subs-search-results.tsx:102-122,141-230` | `packages/utils/src/` | 8, 9 |
| `clampTranslationSize()` / `translationSizeFactor()` | `apps/web/src/lib/reader-text-size.ts` | `packages/utils/src/reader-text-size.ts` | 1, 2 |

Rules: each module must stay dependency-free of React/React Native/DOM/Node
APIs; `packages/utils` already houses similar pure logic (fsrs-scheduler,
saved-words-sync, daily-counter) — follow their export style. When moving a
module, update the web import and delete the web-local copy in the **same
commit** (no duplicated sources). Port or adapt existing web tests into
`packages/utils/src/*.test.ts`.

## Dependencies

- SPEC-053 (mobile durable outbox sync engine) — Task 17 touches its server counterpart.
- SPEC-077/078 (web reader splitter/pagination) — design references for Tasks 3–5.
- SPEC-079 (filter pills), SPEC-081 (AI sort) — behavior references for Tasks 6, 10.
- ADR-0040 — Task 17.
- `packages/shared` types already updated (`translationSize`, `translationSplit`, `SubsSearchVideo.category/tv_show`) — no type work needed beyond consumers.
- Web files listed above remain the source of truth until their logic moves to `packages/`.

## Suggested Order

1. **Task 17 (SRS stale-delete)** — data-loss bug, do first.
2. **Tasks 1–2 (translation size)** — smallest, highest value.
3. **Shared logic extraction** (sentence-map, subs-ai-grouping, durationToSeconds, contextChar, reader-text-size) — unblocks 4, 8, 9, 10, 11 and dedupes web.
4. **Tasks 6, 7, 11, 12, 14 (subs-search foundations)** — filter pills, matched-line rows, duration, autoplay policy, header cleanup.
5. **Tasks 8, 9, 10, 13, 15, 16 (subs-search UI)** — toolbar, grouping, AI sort, list-first, mode toggle, row extraction.
6. **Tasks 3, 4, 5 (reader)** — splitter, sentence highlight, EPUB fresh page.

## Testing & Verification

- **Per-task**: unit tests for every shared module moved into `packages/utils` (ported from web where they exist; note that **neither `sentence-map.ts` nor `subs-ai-grouping.ts` has a web test file today**, so Tasks 4 and 10 get fresh tests, not ports); component-level checks listed in each task.
- **Typecheck**: `npx turbo typecheck` (root) after each shared-module move; `cd apps/mobile && ./node_modules/.bin/tsc --noEmit` after mobile changes.
- **Web regression**: after deleting a web-local copy in favor of a shared module, run the web test suite for the affected component (e.g. `use-paginated-reader.test.ts`, `subs-ai-grouping` tests).
- **Manual mobile QA** (device or simulator): reader translation sizing + slider + splitter drag; subs search pills/grouping/AI sort/list-first/toggle; two-device SRS delete scenario for Task 17.
- **Never build/rebuild the app** without explicit user consent (AGENTS.md build rules).

## Open Questions

1. **Splitter clamp bounds on mobile** — resolved: web clamps to exactly [0.3, 0.7] (`translation-split-handle.tsx:27-28, 45`); mobile matches, but small screens may need a wider band (verify on device).
2. **Info tab on mobile subs-search** — web shows video duration + Watch in the modal's info tab; mobile currently has no info tab. Should mobile gain a minimal info tab (duration, date, views, Watch) as part of Task 13/15, or keep metadata in the row only?
3. **AI sort LLM cost on mobile** — web analyzes top 50 results per term with caching; confirm mobile should reuse the exact same limit/cache keys so results are identical across devices.
4. **`translationSplit` on narrow screens** — mobile side-by-side only activates at a width breakpoint; should the splitter be hidden on narrow (match web) or still draggable?
5. **Task 17 server change scope** — is `zerotohero-python-server/` still an independent repo (not committed from the monorepo)? Confirm the commit procedure before touching server files.

---

## Completion Log

All 17 tasks executed in the suggested order; each task committed separately.
Typecheck (`tsc --noEmit` in `apps/mobile` and `apps/web`) passes after every
commit; `packages/utils` vitest suite passes (160 tests, incl. fresh tests for
sentence-map, subs-ai-grouping, subs-search, reader-text-size). No app builds
were run (AGENTS.md build consent rule); manual device QA still recommended.

| # | Task | Commit (monorepo) |
|---|---|---|
| 17 | SRS stale-delete guard (server `utils_sync.py` + mobile delete payloads) | `a0a8ebc0` (+ server repo `f910002`) |
| 1 | Translation-size ratio rendering (reader + subtitles) | `d674d1ae` |
| 2 | Translation Size slider in display settings | `4fb56337` |
| — | Shared logic extraction (sentence-map, subs-ai-grouping, subs-search) | `8cf9512f` |
| 6 | Content filter pills | `2aba9a4f` |
| 7 | Matched-line-only rows + longest-term highlight | `edc0a670` |
| 11 | ISO 8601 duration parsing + row duration | `da3fd623` |
| 12 | Never autoplay; cue at match line via `startTime` | `066cdc5d` |
| 14 | Remove Watch button + videos-matching header | `44a28c86` |
| 8 | Sort/filter toolbar; queue follows the list | `29eb01e6` |
| 9 | Context-group headers + Collapse/Expand All | `7f7864d3` |
| 10 | Sort by AI grouping + spinner/retry | `3afc1d6c` |
| 13 | List-first layout + playback modal | `79aa0098` |
| 15 | Singleline↔multiline toggle + tabbed sidebar (subs/queue/info) | `2416fbef` |
| 16 | Extract `SubsSearchRow` | `92e95394` |
| 18 | Shared playback modal for subs-search + AI examples (wide-screen multiline) | `fbe53a77` |
| 3 | Resizable text\|translation splitter | `e7d846fd` |
| 4 | Translation-sentence highlight on token tap | `b83da08e` |
| 5 | EPUB fresh page per spine + JP first-line indent | `f5b2dea3` |

### Open Questions — resolution

1. **Splitter clamp bounds** — mobile matches web's [0.3, 0.7]; no device-level
   adjustment made.
2. **Info tab on mobile** — added as the third tab of the Task 15
   `TranscriptQueuePanel` (views, duration, date, Watch), matching web's
   modal info tab.
3. **AI sort LLM cost** — mobile reuses the exact web limits/cache keys
   (`l2|term|first-50 ids`, `AI_ANALYZE_LIMIT = 50`).
4. **`translationSplit` on narrow screens** — the handle only renders inside
   side-by-side rows, which mobile gates at the wide breakpoint (`isWide`),
   so narrow screens never show it (web parity).
5. **Task 17 server change scope** — `zerotohero-python-server/` is an
   independent repo; the `utils_sync.py` fix + test were committed there
   (`f910002`) and the mobile payload hardening in the monorepo.
