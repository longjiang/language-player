# SPEC-077: CSS-Columns Paginated Reader Panel (Shared Across All Readers)

## Metadata

- **Spec ID**: SPEC-077
- **Feature**: One shared paginated reader panel for all web readers, using CSS multi-column layout for pagination and windowed loading of only the estimated previous/next few pages
- **Status**: draft
- **Created**: 2026-08-16
- **ROADMAP Phase**: Phase 4 (Reading)
- **See also**:
  - [SPEC-009 — Reader Layout System](009-reader-layout.md) — shared layout shell the three reader pages sit in
  - [SPEC-032 — EPUB Reader Re-Engineering](032-epub-reader-re-engineering.md) — whole-book model (spine/TOC/locations); §4's "extract `usePaginatedBlocks`" direction is superseded by this spec
  - [SPEC-051 — Mobile Text Scale Parity](051-mobile-text-scale-parity.md) — zoom/leading semantics reused here
  - [ARCH-013 — EPUB Reader Architecture](../arch/013-epub-reader-architecture.md)

## 1. Overview

The three web readers — Notes Reader (`/[l1]/[l2]/reader`), Web Reader (`/[l1]/[l2]/web-reader`), and EPUB Reader (`/[l1]/[l2]/epub`) — currently paginate with two divergent implementations, both built on manual block-height measurement. This spec replaces both with **one shared panel that lets the browser do the pagination**: the reader renders its block window into a CSS multi-column container whose columns *are* pages, so page breaks come from the browser's column layout instead of an accumulated-height walk. The panel only mounts the estimated previous and next few pages (the "window"); page turns inside the window are pure CSS transforms (zero layout work), and only window blocks are tokenized, translated, and rendered. Navigation from search, TOC, links, and restore funnels through one location-based jump API; page count stays an estimate in v1 (exact count becomes a cheap idle-time job in phase 2); tokenized-text setting changes and window resizes re-paginate automatically while keeping the reader's place.

Why this matters: today a long note re-measures **every** block on every re-tokenize, EPUB page turns re-fetch and re-measure windows and show spinners, per-block height caches must be invalidated by hand whenever any text setting changes, and the markdown readers still seek by fragile 40-character text prefixes. CSS columns eliminate the height cache entirely (the browser re-flows, we just re-read geometry), make page turns GPU-cheap, and give every reader the same continuous, location-based paging the EPUB reader already has.

## 2. Background — why the current pagination needs replacing

Two paginators exist today:

1. **`ReaderPanel`** (`apps/web/src/components/reader/reader-panel.tsx`, notes + web readers): renders **all** blocks into a hidden measuring div, walks `offsetTop`/`offsetHeight` to find block-index page breaks, then renders the current page's slice. `pageBreaks` recompute from scratch on every content change, translation toggle, and zoom change; tokenization and translation are per-page with no prefetch; navigation uses `initialAnchor` (a 40-char text prefix seek) which is vestigial — no caller passes it today (see §7.3).
2. **`usePaginatedBook`** (`apps/web/src/hooks/use-paginated-book.ts`, EPUB): lazy windows of up to 240 blocks, hidden-measured forward/backward, a per-block height cache invalidated on width change, and a chars-per-page moving estimate. Page turns show a spinner while the next window fetches and measures.

Both share the same fundamental cost: **page breaks are derived from per-block height measurement**, which means (a) a hidden measuring DOM that must mirror the real rendering (including translation skeletons, ruby line-height classes, action-button spacers), (b) caches that must be invalidated whenever any layout input changes, and (c) re-measurement passes on every page turn and every setting change.

CSS multi-column layout removes all three: the browser owns line breaking, widows/orphans, and block boundaries; blocks laid out in a fixed-height, fixed-column-width container flow into columns automatically; and the column a block landed in is readable from its geometry (`offsetLeft`). No height cache, no measuring mirror — the real rendered content *is* the layout. SPEC-032 §4 already anticipated extracting a reusable paginator; this spec picks the column-based route for that extraction and applies it to all three readers.

## 3. Goals

- One shared `PaginatedReader` component + one `useCssColumnsPager` hook used by all three web readers.
- Pagination implemented with CSS `column-width` / `column-fill: auto`; each column is one page.
- Only the estimated previous and next few pages are mounted ("the window"); nothing outside the window renders, tokenizes, or translates.
- Page turns inside the window cost a CSS transform only; window rebuilds happen rarely and never flash a blank page.
- Navigation (search results, TOC entries, internal links, saved-position restore) resolves to a **location** in one global block stream and jumps to the exact page containing it; the fragile text-prefix anchor seek is deleted.
- Page count keeps working: `n / ~N` estimate in v1, exact count as an optional phase-2 idle job.
- Tokenized-text setting changes (zoom, leading, typeface, phonetics, interlinear definitions, translation toggle, …) and window resizes re-paginate automatically, keep the reader's place (anchor block restore), and never reset to page 1.
- EPUB keeps its whole-book model, location persistence, search highlights, and Back-stack; notes/web readers gain the same location model.

## 4. Non-goals

- No mobile implementation: React Native has no CSS multicol; mobile keeps its measurement-based `PaginatedReader` (behavior parity only, see §13).
- No two-page spread / facing-pages mode (page width stays "one column per page").
- No change to tokenization, translation, dictionary, or save-word behavior — only where blocks are rendered.
- No change to the edit tab of the notes reader, the bookshelf/cover flows, or EPUB search indexing.
- Not converting to a virtualized list (e.g., `react-virtuoso`): columns + transform is simpler and preserves real text layout (find-in-page, selection, fonts).

## 5. Core design: the CSS-columns pager

### 5.1 DOM/CSS contract

```
.viewport                          ← relative; overflow: hidden; height: 100% (flex child)
  .pager                           ← position: absolute; top/left: 0; will-change: transform
                                     width: (windowPages + 1) × pitch   (see 5.3)
                                     height: 100%
                                     column-width: PAGE_W (px, integer)
                                     column-gap: GAP (px, integer, 32–48)
                                     column-fill: auto
                                     transform: translateX(-offset)    (see 5.3)
    .block[data-block-index=i]     ← ONE direct child per block — the column breaks
                                     between blocks, and geometry reads iterate children
```

Contract rules (each is load-bearing):

- **One element per block, as a direct child of the pager.** This is the same lesson SPEC-032 recorded for its measuring container: a wrapper around all blocks would measure as one child and produce one-block pages. `TextActionMenu` already renders a single root per block and can BE the pager child; markdown blocks (`kind: 'markdown'`) get a single wrapper div.
- **The pager has zero horizontal padding and no border**, so `offsetLeft` of a child equals `columnIndex × pitch` exactly. Horizontal reading padding moves onto each block wrapper (`px-4` etc.), uniform across columns.
- **`column-fill: auto`** (not the default `balance`): columns fill top-to-bottom in order. Requires the definite height the pager has.
- **`PAGE_W` and `GAP` are integers in px**, set from JS (`PAGE_W = viewport.clientWidth`, see §10; `GAP = 40` default). `pitch = PAGE_W + GAP`; geometry math divides by it, so fractional pitches would accumulate rounding errors.
- **Block splitting**: default `break-inside: auto` — long paragraphs may split across a page boundary, like a real book (browser `orphans`/`widows` default to 2). Headings get `break-after: avoid`. Images, `pre`, tables, and markdown blocks get `break-inside: avoid`.
- **Blocks taller than the page** (a huge `pre`, a giant image): with `break-inside: avoid` they land in their own column and overflow the pager height. Give them `max-height: 100%; overflow: auto` so they scroll inside their page instead of clipping (matches today's overflow behavior).
- **RTL**: `page-progression-direction: rtl` books mirror the transform direction (§12).

### 5.2 Reading page breaks back from geometry

No height measurement. After layout settles (double `requestAnimationFrame`, the pattern both current readers use), walk the pager's children once:

```ts
pageOf(i)   = Math.round(child[i].offsetLeft / pitch)
endPageOf(i)= Math.round((child[i].offsetLeft + child[i].offsetWidth - 1) / pitch)
```

- `pageOf(i)` is the page the block **starts** on; `endPageOf(i)` differs only for blocks split across a boundary (natural with `break-inside: auto`).
- A block `i > windowStart` **starts a page** iff `pageOf(i) > pageOf(i - 1)`. These indices form the **break list**.
- Blocks that start a page are the only legal window boundaries (invariant, §6.1).

This is O(window blocks) per read and happens on: window mount, window rebuild, settings change, resize. There is no height cache to invalidate — the browser already re-flowed; we just re-read.

### 5.3 Page turns

The visible page is the column currently aligned with the viewport. The pager is translated so that the current page's column sits at the viewport's left edge:

```ts
transform = translateX(-(currentPageInWindow) × pitch)
```

`currentPageInWindow` is the current page's index among the window's columns (0-based). Because the window always contains the current page (invariant, §6.1), a page turn inside the window is **only** a transform change — no layout, no re-render of blocks. This is the performance win over both current readers.

Alternative considered: a horizontally scrolling viewport (`scrollLeft = page × pitch`, optional `scroll-snap-type: x mandatory`). Transform is chosen because it never shows a scrollbar, never fights programmatic positioning with snap, and composes on the GPU. (Decision point, easy to flip — §17.)

Fixed-position hazards: the token dictionary popup and the action-menu popover are dialogs portaled to `document.body` (Radix), so the pager's transform does not break their positioning.

### 5.4 Global page numbers and the break map

Page indices inside the window are local to the pager; the UI needs **global** page numbers ("page 42 of 612") that survive window slides. The hook maintains a **partial break map** over the global block stream:

- **Exact entries**: block indices verified as page starts by geometry, persisted across window slides, keyed by block index (and invalidated together, §9).
- **Estimated entries**: between measured ranges, synthesize breaks every `charsPerPage` chars (the same technique `use-paginated-book` already uses — see §8.1).

`globalPageOf(blockIndex)` = number of breaks (exact where known, estimated elsewhere) at or before that index. The current page's number always comes from measured breaks (the current page is inside the mounted window, so it is measured), so the displayed number is exact even while `totalPagesEstimate` is not. This mirrors the EPUB reader's "exact current position, estimated total" behavior.

## 6. Windowing: only the estimated previous/next few pages are loaded

### 6.1 Window model

The **window** is the range of blocks mounted in the pager: `[windowStart, windowEnd)`, chosen to cover `[currentPage − K, currentPage + K]` estimated pages with `K = 2` (2 ahead in the reading direction, 2 behind; a tunable constant). Block ranges for estimated pages come from a lazy per-block cumulative-char array (`prefixChars`, built as blocks load; markdown is synchronous, EPUB fills it from spine text data + `getBlocks`):

```ts
blockIndexAtEstimatedPage(p) = first block i with prefixChars[i] ≥ p × charsPerPage
```

The window is extended by ~30% slack on each side (in chars) so measurement error never clips the current page out of the window.

**Invariants** (both enforced by the hook):

1. The window's first block starts a page (verified by geometry after mount; §5.2), so the window's column 0 is a real page start and global page numbers attach cleanly.
2. The current page is always inside the window. When a page turn brings the current page to the window's edge (second-to-last column in the direction of travel), the hook **recenters** the window on the new current page — at most every K+1 turns, not every turn.

### 6.2 What "loaded" means, per resource

"Loading only the estimated previous/next few pages" applies to every expensive pipeline:

| Resource | Policy |
|---|---|
| Block DOM (TokenizedText) | Only window blocks are mounted. A full book never renders more than ~(2K+1) pages of blocks. |
| Lemmatization (`onLemmatize` batch) | Window blocks, parent-driven via the existing `deferTokenization` pattern (extended from "visible page" to "window"). Tokens cached in a map; keep an LRU bound (~15 pages) so huge books don't grow memory forever. |
| Dictionary bulk lookups | Automatic: they fire for any rendered `TokenizedText` once tokens arrive — adjacent pages get instant popups by the time the user turns to them. |
| Translation (`onPageTranslate`) | Visible page only (cost is high); md5-keyed cache makes revisits instant. Prefetching the next page's translation is an optional follow-up. |
| EPUB images | `loading="lazy"` — offscreen window columns don't fetch images until the user nears them. |

The invisible columns of the pager are exactly where the "previous and next few pages" live while the user reads the middle one — the wording of this spec's title feature.

### 6.3 Window rebuild: double-buffered, no blank flash

A recenter replaces the pager's content. Rebuild sequence:

1. Keep the **active pager** (current window, with the visible page) mounted and interactive.
2. Render a **pending pager** in the same viewport position with `visibility: hidden` (layout still computed), containing the new window's blocks. For EPUB this may await `getBlocks` (prefetch the next spine item's blocks on idle after a jump so it is usually cached).
3. Double-rAF, then read the pending pager's geometry (break list, chars-per-page sample).
4. Swap: pending becomes visible, active becomes hidden, active unmounts on the next frame.

Generation refs guard stale fetches/measurements (the `genRef`/`fetchRef` discipline from `use-paginated-book`; note its StrictMode lesson: guard the reset effect so the only in-flight fetch isn't dropped). During the swap the user keeps reading the old page — strictly better than the current EPUB spinner.

## 7. Locations and navigation

### 7.1 Location model

One location type over a **global block stream** (see §11.1 for the stream abstraction):

```ts
interface ReaderLocation { streamIndex: number; offset: number }  // block index + char offset
```

- **Notes / web reader**: `streamIndex` = index into the markdown `ReaderBlock[]` (text and markdown blocks both occupy stream indices).
- **EPUB**: the existing `BookLocation { spineIndex, blockIndex, offset }` maps to a stream index via a cached per-spine block-count table (`globalIndexOf(spine, block)`, filled as spine items load) — the same spine-offset math `use-paginated-book`'s `charsBefore` already performs, at block granularity.

### 7.2 Jump algorithm

`jumpTo(location)` — one path for every navigation source:

1. **Estimate** the target page: `p = floor(charsBefore(location) / charsPerPage)` (same function `use-paginated-book.estimatePageNumber` uses today).
2. **Set the window** around page `p` (§6.1) and rebuild (double-buffered).
3. **Measure**: read geometry; the exact page of the target block = `globalPageOf(block)` from the measured break list.
4. If the target block starts mid-window, no further work. If the estimate placed the target outside the measured range (rare — estimate error), extend/recenter and re-measure once.
5. **Refine to char offset** only when a highlight must land on the exact character (§7.4). Otherwise block-start page is sufficient.

The page counter shows the measured page number after step 3; between steps 1 and 3 it may show the estimate briefly (the existing `n / ~N` affordance already signals "estimate").

### 7.3 Navigation sources

| Source | Resolution | Notes |
|---|---|---|
| **Search** (EPUB sidebar) | Result already carries a `BookLocation` → `jumpTo` | `EpubSearchPanel.onNavigate` unchanged; highlight passed through (below) |
| **TOC** (EPUB sidebar) | `EpubBook.resolveHref(href)` → location → `jumpTo` | Current `handleLoadChapter` behavior preserved |
| **Internal links** (EPUB) | `resolveHref(href, currentSpineHref)` → `jumpTo` | Existing `onOpenLink` path; Back-stack (`pushHistory`) preserved |
| **External links** | Route to web reader (unchanged) | — |
| **Restore** (EPUB) | `lastLocation` → `jumpTo` | Replaces the jump-on-open effect with the same call |
| **Markdown headings** (future) | Heading block → `jumpTo` | A heading TOC for notes/web-reader becomes trivial once locations exist |
| **Saved position** (future) | `onLocationChange` → persisted location → `jumpTo` | The panel already reports the visible page's start block (§11.3) |

**Deletions**: `ReaderPanel`'s `initialAnchor` / `onAnchorChange` props and the prefix-probe seek effect (§1, §2) — no caller passes them today; the shared panel's `initialLocation` replaces them.

**Search highlight**: the existing `highlight: { block, start, end }` prop pattern generalizes to `{ streamIndex, start, end }`. `onHighlightDismiss` on page-away stays.

### 7.4 Highlight refinement (exact char page)

A target block may span two columns (paragraph split). The highlight must land on the page containing the character range. Two-stage refinement:

1. **Immediately**: show the highlight on the block's start page (block-start page from the measured break list).
2. **Once the block's tokens load**: compute the range's column with real DOM geometry — `document.createRange()` from block start to the offset, `range.getBoundingClientRect().left`, page = round(left / pitch) — and if that page differs from the start page, re-position the transform to it. `getBoundingClientRect` accounts for the pager transform, so this works on live rendered content with no sentinel elements.

## 8. Page count

### 8.1 Estimate (v1)

The current `n / ~N` behavior, unchanged in spirit:

- `charsPerPage` is derived from up to 3 page breaks inside the **currently mounted** window (chars of text between breaks ÷ number of pages), frozen per layout identity — exactly the moving-average trick `use-paginated-book` uses, but from column geometry instead of a height walk.
- `totalPagesEstimate = ceil(totalChars / charsPerPage)`, where `totalChars` is the stream's total text length (markdown: sum of block texts; EPUB: already computed by the search index).
- The current page number is always exact (§5.4). Display keeps `page / ~N` styling.

### 8.2 Exact count (phase 2, optional)

CSS columns make an exact whole-book count a **single layout pass** — no per-block height bookkeeping — so the idle-time job SPEC-032 deferred becomes cheap enough to revisit:

- Mount the full stream into an offscreen pager (`position: fixed; left: -200vw; visibility: hidden`) with the same `PAGE_W`/height/`column-fill: auto`, and `width` set to a large constant (e.g. `1_000_000px`, safely more columns than any book has).
- Read the last block's `offsetLeft` → exact total pages, and read the **full break list** → exact page number for every future `jumpTo` target (no estimate step at all).
- Run in an idle callback after first paint, chunked if needed, cancellable on book close/settings change; cache the break list keyed by layout identity (§9) alongside the search index.
- v1 ships without it (estimate-only, exactly like today); this section is the plan for when exact totals matter (e.g., "jump to page N" UI).

Bookshelf progress stays character-based (viewport-independent) — unchanged.

## 9. Tokenized text settings adjustments

**Layout-affecting settings** (anything that changes rendered metrics, so page breaks change):

| Setting | Source | Effect |
|---|---|---|
| `tokenizedText.zoom` | SettingsContext | font size → reflow |
| `tokenizedText.leading` | SettingsContext | line height → reflow |
| `tokenizedText.typeFace` | SettingsContext | font metrics → reflow |
| `tokenizedText.quickGloss` | SettingsContext | inline glosses add lines → reflow |
| `display.translation` | SettingsContext | translation blocks added/removed → reflow |
| `l2[code].tokenSpan.phonetics` (ruby/word) | SettingsContext per-L2 | ruby rows are taller → reflow |
| `l2[code].tokenSpan.definition.show` | SettingsContext per-L2 | interlinear definition lines → reflow |
| `l2[code].display.traditional / byeonggi` | SettingsContext per-L2 | script width changes → reflow |

(`tokenizedText.mode` quiz blanking must render blanks that **preserve word width** — underscored blanks of the same length — so it never changes wrapping and does not reflow; if a future quiz style violates that, add it to the list.)

**Policy**: all of the above fold into one `layoutIdentity` string (the generalization of `use-paginated-book`'s `measureNonce` — the reader already computes an equivalent: `textZoom + showTranslation + phoneticsEstimate`). When `layoutIdentity` changes:

1. Invalidate the break map, the chars-per-page divisor, and any exact-count cache (they were derived for the old metrics).
2. Re-read geometry of the **currently mounted window** after the browser re-flows (double-rAF). No height cache exists to clear — this is the whole point of columns.
3. **Restore the anchor**: before the change, record the visible page's first block (`anchorBlock`); after re-flow, find its new page from the fresh break list and set the transform there. If it is gone (content changed underneath), fall back to the same estimated page index. Never reset to page 1.
4. Re-derive `charsPerPage` from the new layout; the estimate updates itself.

Because the window (±K pages) stays mounted through the reflow, the anchor virtually always survives without a rebuild; a rebuild happens only if the anchor exits the window (extreme zoom-out).

## 10. Window resize

The reader viewport's size drives both dimensions of the pager:

- **Width** → `PAGE_W` (and thus `pitch`). v1: `PAGE_W = viewport.clientWidth` (one page fills the reader); cap at `44rem` and center as a follow-up if line lengths feel long on ultrawide screens. Sidebar open/close (SPEC-009) and responsive breakpoints therefore re-paginate like any width change.
- **Height** → pager height = `viewport.clientHeight` (the panel already sits in a flex column with the fixed nav bar below it, so this is exact; the `window.innerHeight − 200` heuristic from `ReaderPanel` dies with the measuring div).

Behavior on resize (debounced ~150ms via a `ResizeObserver` on the viewport, plus a `window` resize fallback):

1. Reflow is automatic (CSS); nothing to re-measure by hand.
2. Double-rAF, then re-read geometry: new break list, new `charsPerPage` (re-derived), updated `totalPagesEstimate`.
3. **Anchor restore** (§9.3): the visible page's first block is re-found and the transform re-set, so the reader stays on the same text — no page jump, no spinner. This holds for every resize: window drag, tablet rotation, sidebar toggle, mobile browser chrome collapse.
4. `prefixChars` is char-based and untouched by resize; only the break map and divisor are invalidated.

## 11. Shared architecture

All new code lives in `apps/web` (DOM/CSS — the shared packages stay platform-agnostic per AGENTS.md).

### 11.1 `BlockStream` — `apps/web/src/lib/block-stream.ts`

The seam that makes one panel serve three readers. A reader supplies a stream; the pager consumes it.

```ts
interface BlockStream {
  totalChars(): number;                       // whole-stream text length (sync where possible)
  blockCount(): number;                       // may be a lower bound until lazy loads complete
  prefixChars(): Promise<number[]>;           // cumulative chars per block, filled lazily
  blocks(from: number, to: number): Promise<Block[]>;
  charsBefore(streamIndex: number): number;   // for estimate math
  locationToStreamIndex(loc: ReaderLocation): number;
  streamIndexToLocation(i: number): ReaderLocation;
}
```

- **Markdown stream**: wraps `ReaderBlock[]` from `parseMarkdown` (synchronous; `blocks()` resolves immediately).
- **EPUB stream adapter**: wraps `EpubBook`; `blocks()` = `getBlocks` across spine boundaries; stream index → `{spineIndex, blockIndex}` via the per-spine block-count table; `totalChars` from the existing search index.

### 11.2 `useCssColumnsPager` — `apps/web/src/hooks/use-css-columns-pager.ts`

All pagination logic, no rendering:

- State: `viewportRef`, `pagerRef` (active) / pending pager refs, window range, break list, `charsPerPage`, `totalPagesEstimate`, `currentPage`, `measuring`/`swapping` flags, generation refs.
- Layout identity + resize handling (§9, §10).
- API: `jumpTo(location)`, `nextPage()`, `prevPage()`, `currentPage`, `totalPagesEstimate`, `windowRange`, `pageBreakList`, `renderPager(children)` / `renderPendingPager(children)`, `onLayoutSettled(cb)`.
- Consumes `BlockStream`, `onLemmatize`, `onPageTranslate` — it drives the window's tokenization and the visible page's translation exactly as the two current readers do, and the parents keep their existing props.

### 11.3 `PaginatedReader` — `apps/web/src/components/reader/paginated-reader.tsx`

The shared panel. Renders the viewport + active/pending pagers, the page-nav bar (`‹ n / ~N ›` + translation toggle, unchanged UX), keyboard paging (arrows/PageUp/PageDown/space, unchanged), flick/swipe page turns (horizontal pointer drag on the viewport, mobile-parity thresholds: ≥800 px/s flick velocity or ≥min(64 px, 18% width) drag distance; vertical pans stay native via `touch-action: pan-y`), and reports `onLocationChange(location)` whenever the visible page's start block changes (the existing EPUB persistence hook generalizes to all three readers). A `renderBlock(block, index) => ReactNode` injection lets each reader supply its own block rendering (markdown `TextActionMenu`+`TokenizedText` vs EPUB image/link handling) while all layout, windowing, and navigation stay shared.

### 11.4 Per-reader integration

| Reader | Change |
|---|---|
| Notes (`reader/page.tsx`) | Unchanged page; `ReaderPanel`'s read mode swaps its internals for `PaginatedReader` (edit tab, mode tabs, empty states, sample fill, notes wiring stay in `ReaderPanel`). |
| Web reader (`web-reader/page.tsx`) | Same — swaps to `PaginatedReader`; `initialAnchor`/`onAnchorChange` props deleted. |
| EPUB (`epub/page.tsx`) | `EpubReaderPanel` swaps its body for `PaginatedReader`; keeps location persistence, highlight, Back-stack, sidebar wiring. `use-paginated-book.ts` and its measuring window are deleted once EPUB is on the shared panel. |

## 12. Edge cases

- **Window rebuild races**: generation refs guard stale fetches/geometry; StrictMode double-invoke of reset effects must not drop the only in-flight fetch (SPEC-032 §"Implementation notes" #4).
- **Blocks taller than the page**: `max-height: 100%; overflow: auto` on `pre`/images/tables/markdown blocks (§5.1).
- **Short content**: fewer blocks than one page — one column, `1 / 1`, prev/next disabled.
- **Jump to the very end** (search hit in the last block, TOC to the final spine item): window recenters on the last estimated page; the break list is exact there; no off-by-one page counter (verify in §18).
- **RTL books**: `page-progression-direction: rtl` mirrors the transform sign and swaps prev/next; full mirrored layout out of scope (unchanged from SPEC-032).
- **Empty text / parse failure**: existing empty states; pager renders nothing.
- **Huge books**: bounded DOM (§6.2), LRU token/translation caches, prefetch on idle; exact-count job cancellable.
- **Mid-window content change** (note text edited → re-tokenize): blocks replaced → full re-measure with anchor fallback (§9.3); translations/tokens reset exactly as `ReaderPanel` does today.
- **Browser find (Ctrl+F)**: finds only mounted window content (same as any virtualized reader); the EPUB in-app search covers the whole book — unchanged.
- **Selection/copy**: real text DOM, works across columns; the selection dictionary popup is a body-portaled dialog, unaffected by the transform.
- **The pager width is unknown up front** (window page count): pager width = `(windowPages + 1) × pitch` — one spare column so the last page never gets clipped by rounding (§5.1, §6.1).

## 13. Mobile parity note

`apps/mobile/components/reader/PaginatedReader.tsx` keeps its measurement-based pagination (RN has no CSS multicol). Parity obligations from this spec: the same layout-identity set (§9), anchor restore on settings/resize, and location-based navigation — the mobile readers already derive their own calibration signature covering zoom/typeface/phonetics/definition, which is the same input set. No mobile code changes are required by this spec; align the identity set when the mobile paginator next touches its `measureNonce` equivalent.

## 14. Implementation plan

### Phase A — foundations (shared, no reader changes yet)

1. `lib/block-stream.ts`: interface + markdown stream.
2. `hooks/use-css-columns-pager.ts`: pager DOM contract, geometry reading, break map, window model, transform turns, double-buffered rebuild, layout identity, resize handling, estimate math.
3. `components/reader/paginated-reader.tsx`: viewport/pager rendering, nav bar, keyboard, `onLocationChange`.

### Phase B — migrate markdown readers

1. `ReaderPanel`: read mode → `PaginatedReader`; delete measuring div, `pageBreaks`, `visibleBlocks` slicing, token-load effect, anchor-seek effect, `initialAnchor`/`onAnchorChange` props.
2. `reader/page.tsx`, `web-reader/page.tsx`: unchanged props; verify.

### Phase C — migrate EPUB

1. EPUB stream adapter + `globalIndexOf` block-count table.
2. `EpubReaderPanel` body → `PaginatedReader`; keep highlight/search/Back/persistence wiring; prefetch next spine item on idle.
3. Delete `use-paginated-book.ts` and the EPUB measuring window.

### Phase D — polish + follow-ups

1. Exact-count idle job (§8.2) if the product wants exact totals / jump-to-page.
2. `PAGE_W` cap + centering for ultrawide (optional).
3. Mark SPEC-032's `usePaginatedBlocks` extraction note superseded; update ARCH-013; update ROADMAP.

## 15. Files changed

| File | Change |
|---|---|
| `apps/web/src/lib/block-stream.ts` (new) | `BlockStream` interface + markdown stream |
| `apps/web/src/hooks/use-css-columns-pager.ts` (new) | Column-based pager hook (window, breaks, estimate, identity, resize) |
| `apps/web/src/components/reader/paginated-reader.tsx` (new) | Shared panel (viewport, pagers, nav, keyboard, location reporting) |
| `apps/web/src/components/reader/reader-panel.tsx` | Read mode → `PaginatedReader`; delete measuring + anchor code and props |
| `apps/web/src/components/reader/epub-reader-panel.tsx` | Body → `PaginatedReader`; keep highlight/search/persistence wiring |
| `apps/web/src/hooks/use-paginated-book.ts` | Deleted (superseded) |
| `apps/web/src/app/[l1]/[l2]/reader/page.tsx` | No functional change (verify) |
| `apps/web/src/app/[l1]/[l2]/web-reader/page.tsx` | No functional change (verify) |
| `apps/web/src/app/[l1]/[l2]/epub/page.tsx` | No functional change (verify) |
| `docs/arch/013-epub-reader-architecture.md`, `ROADMAP.md` | Updated after implementation |

## 16. Dependencies

- SPEC-009 (layout shell), SPEC-032 (locations, search, persistence), SPEC-051 (zoom semantics).
- No new npm dependencies — CSS multicol is native.
- New translation keys: none expected (`msg.page_of` exists; `n / ~N` display exists). If the exact-count phase adds a "Jump to page" control, one key follows the usual 31-locale pipeline.

## 17. Open questions

1. **Transform vs scroll viewport** — transform (this spec's choice) vs `scrollLeft` + scroll-snap. Transform wins on control; scroll wins on native gesture/accessibility. Confirm during Phase A with a quick prototype.
2. **Block splitting** — default `break-inside: auto` (book-like paragraph splits) vs `break-inside: avoid` (current behavior, no split blocks, but tall blocks overflow). The spec defaults to splitting; flag if product wants the old guarantee.
3. **Window constants** — `K = 2`, 30% slack, 150ms resize debounce, 15-page LRU. Tune against the fixture books.
4. **`PAGE_W` cap** — full-width columns vs a `44rem` cap + centering. Try full-width first.
5. **Exact count job** — worth the phase-2 cost? The estimate has satisfied EPUB so far (SPEC-032 open question 3); revisit when jump-to-page is requested.

## 18. Verification plan

- **Typecheck**: `cd apps/web && ./node_modules/.bin/tsc --noEmit`; `npx turbo typecheck` from the repo root.
- **Fixture books** (`tmp/testing-assets/epub/`): Botchan (fragment-shared TOC entries → distinct pages), Snow Country (untoc'd spine items), Engels (3-deep TOC). Page turns never show the spinner mid-window; jumps land on the exact page; resize and zoom changes keep the anchor block visible; RTL book flips direction.
- **Invariants** (browser console, `[LP Web]`-prefixed logs):
  - geometry read: every `pageOf(i)` ≤ `endPageOf(i)`; break list is strictly increasing.
  - window: current page always in `[windowStart, windowEnd)`; window rebuilds happen at most every K+1 turns.
  - page counter: current page exact (measured) at all times; `totalPagesEstimate` within ±10% of the exact count when the phase-2 job is on.
- **Perf smoke**: a long note (~1k blocks) and a large book — DOM node count stays bounded by the window; a page turn inside the window triggers no layout (`PerformanceObserver` long-task check) and no token/translation requests for out-of-window blocks.
- **Settings matrix**: toggle zoom/leading/typeface/quickGloss/translation/ruby/interlinear definitions — each re-paginates, keeps the anchor block, and never resets to page 1.
- **Regression**: word taps open the dictionary popup on every page including transformed ones; selection dictionary works; keyboard paging works; EPUB search highlight lands on the page containing the match and dismisses on page-away; notes auto-save and web-reader load flows unchanged.
