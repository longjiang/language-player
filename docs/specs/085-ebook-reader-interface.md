# SPEC-085: EBook Reader Interface — Full-Screen Tap Surface, Chrome Clearance, and Fixed-Height Modals

## Metadata

- **Spec ID**: SPEC-085
- **Feature**: The opened-book interface (`apps/web` + `apps/mobile`): a full-screen blank-space tap surface that toggles the reader chrome, hard clearance rules between the chrome bars and the always-visible chapter title / page counter, and a search modal whose height is independent of the result count
- **Status**: in-progress — implemented 2026-08-19 in `apps/web` + `apps/mobile` (both typecheck clean); runtime verification (red paint test, clearance measurements, keyboard behavior) still outstanding
- **Created**: 2026-08-19
- **ROADMAP Phase**: Phase 5 (Content Features) — Reading
- **See also**:
  - [SPEC-032 — EPUB Reader Re-Engineering](032-epub-reader-re-engineering.md) — whole-book model, locations, search
  - [SPEC-077 — CSS-Columns Paginated Reader](077-css-columns-paginated-reader.md) — the shared `PaginatedReader` this spec's chrome lives in
  - [SPEC-082 — Mobile/Web Reader Parity](082-mobile-web-parity-reader-subs-sync.md), [SPEC-049 — Mobile Feature Parity](049-mobile-feature-parity.md)
  - [ARCH-013 — EPUB Reader Architecture](../arch/013-epub-reader-architecture.md)

## 1. Overview

When a book is open, both apps render an **immersive reader**: the site/app header hides, the book fills the screen, and a minimal **chrome** (the app header + a bottom pagination bar + a close button) floats over the content, hidden by default and revealed by tapping a **blank area** of the page. This spec defines that interface precisely:

1. **The tap surface covers the entire screen.** The blank-space tap that toggles the chrome must work everywhere — including the empty area below the last paragraph and the reserved top/bottom strips — with the only exceptions being genuinely interactive elements (tokens, links, buttons, inputs). Verification: temporarily paint the tap surface red; the red area must cover 100% of the screen.
2. **Hard clearance between the chrome and the persistent overlays.** The chapter title (top) and close button must sit **≥ 8 px below the site top bar** when the chrome is visible; the page counter (bottom) must sit **≥ 8 px above the bottom bar** when the chrome is visible. Both overlays keep a *fixed* position — toggling the chrome never moves them and never reflows the book.
3. **The search modal has a fixed height** independent of the number of results. The initial state and the empty-result state render a reserved **empty results area** of the same size as the results list, so the search bar stays pinned near the top of the modal, well above the software keyboard.

The design keeps the core invariant the immersive reader already has: **toggling the chrome is a pure overlay animation and never re-paginates the book.** Everything in this spec is about *where the overlays and the tap surface live*, not about pagination itself.

## 2. Terminology

- **Chrome** — the transient reader furniture that fades/slides in and out: the **site top bar** (the app header: logo, nav, search), the **bottom bar** (pagination chevrons, page readout, translation toggle, TOC and Search buttons), and the **close button** (top-right ✕).
- **Blank area / blank-space tap** — a tap whose hit target is not an interactive element (definition in §5). Tapping one toggles the chrome.
- **Reserved strip** — the constant top/bottom padding applied to the reader container. The chrome and the persistent overlays live inside the strips as overlays; the paginator measures the viewport between them, so the strip sizes must never change at runtime.
- **Persistent overlay** — the muted chapter title (top strip) and muted page counter (bottom strip). Always visible in both chrome states; never interactive; never re-positioned by chrome state.
- **Top bar / bottom bar** — the two chrome bars (synonyms: "site top bar", "pagination bar").
- **Chrome ON / chrome OFF** — chrome visible / chrome hidden.

## 3. Current behavior and the bugs this spec fixes

All numbers are as-built at the time of writing (`apps/web/src/app/[l1]/[l2]/epub/page.tsx`, `apps/web/src/components/reader/paginated-reader.tsx`, `apps/mobile/app/(tabs)/(reading)/epub.tsx`, `apps/mobile/components/reader/PaginatedReader.tsx`).

| # | Current behavior | Bug |
|---|---|---|
| 1 | Web: the blank-tap click listener is attached to the **scroll viewport** (`pager.viewportRef.current`), which only spans the text area — not the reserved strips. Mobile: the tap `Pressable` wraps **only the visible blocks**, so the empty page area below the last paragraph is not tappable. | The tap surface does not cover the entire screen. |
| 2 | Web: title overlay at `pt-2.5` (10 px from screen top); close button at `top-1.5` (6 px). Mobile: title `paddingTop: insets.top + 10`; close at `insets.top + 6`. The top bar is 57 px tall (web) / `insets.top + 57` (mobile). | When the chrome is ON, the site top bar covers the chapter title and the close button entirely. |
| 3 | Page counter overlay at `pb-2.5` (10 px from screen bottom). The bottom bar is ~41 px tall (web: 8 px padding + 24 px button row + 1 px border) / ~27 px + `insets.bottom` (mobile) and sits at the screen bottom. | When the chrome is ON, the bottom bar covers the page counter entirely. |
| 4 | Web search dialog: `max-h-[80vh]`, content-sized — with zero results the modal collapses to a short strip and the search bar sits low on screen. Mobile: modal `max-h-[85%]` with the panel in a `max-h-[70%]` `ScrollView`. | The search modal height depends on the result count; with the software keyboard open, the search bar can end up under or level with the keyboard. |
| 5 | Web: the immersive `PaginatedReader` is inside a `flex-1` wrapper that is not itself a flex container, so the reader can collapse to rendered content height instead of occupying the full viewport. Mobile: the equivalent native containers are flex layouts by default. | The page area and bottom bar stop after short content, leaving a large unused region below the reader. |
| 6 | Mobile derives the reader's left padding from the rendered L2 line leading; web EPUB content still uses a fixed `px-1` margin. | The web text starts too close to the page edge and the horizontal layout is not visually aligned with mobile. |

## 4. Design invariants

1. **Toggling the chrome never reflows the book.** The reserved strips are constants; the chrome bars and the close button are overlays that slide/fade over them. The persistent overlays (title, counter) keep the exact same position in both chrome states.
2. **Clearance is measured from the chrome's real edges.** "≥ 8 px below the top bar" means below the bar's *bottom edge* (its border included); "≥ 8 px above the bottom bar" means above the bar's *top edge* (its border included). On mobile the top bar's height includes the safe-area inset, so the clearance is from the header's rendered bottom edge, not the screen top.
3. **Everything non-interactive is part of the tap surface** (§5). Interactive elements claim their own touches; the tap surface covers the rest of the screen, no gaps.
4. **Persistent overlays are never interactive** (`pointer-events: none`) — they never block taps or clicks on the surface beneath them.
5. **Modals take over input.** While the TOC or Search modal is open, its backdrop absorbs all touches; the reader's tap surface is inert underneath.
6. **The reader frame fills the viewport.** Once a book is open, the web and mobile reader roots occupy the full available screen height; the text viewport is the screen height minus the constant reserved strips, even when the current page has very little text.
7. **Horizontal reader geometry follows typography.** The left page margin equals the rendered L2 body-text leading, and the side-by-side L2/L1 gap uses the same leading value. The visible reader, measuring mirror, and pagination width calculations use identical horizontal geometry.
8. **Vertical paragraph spacing is web parity (`mb-0`).** Web renders reader text blocks with no inter-block margin (`[&_p]:mb-0`) and separates paragraphs by the first-line indent (`indent-[1em]`). Mobile text blocks must also render with no vertical gap (the `PaginatedReader` block wrapper has no `mb-3`), relying on the same first-line indent, so reader line/paragraph density matches web (Chrome). The pagination fallback inter-block gap (`DEFAULT_BLOCK_GAP`) and `estimateBlockHeight`'s trailing gap follow suit (0). Images/tables/hr keep their own margins.

## 5. The tap surface

### 5.1 Definition

The tap surface is the region in which a blank-space tap toggles the chrome. **It covers the entire screen** — the text column, the empty space below the last paragraph, the left/right margins, and the reserved top/bottom strips (including the area under the persistent title and counter overlays).

**Excluded — a tap on any of these never toggles the chrome:**

- **Word tokens** (tap → dictionary lookup) and **links** (internal book links, external URLs)
- **Buttons and controls**: prev/next page chevrons, the page-number readout, the translation switch, the TOC button, the Search button, the close (✕) button, any header control (logo, nav links, search, menu)
- **Inputs** (search fields, etc.)
- **Active text selection** (web: a tap while `window.getSelection()` is non-empty must not toggle; mobile: a long-press selection gesture must not toggle)
- **The TOC/Search modals and their backdrops**, while open
- The hidden measuring mirror (already `pointer-events: none`)

**Included — taps that DO toggle the chrome:**

- Empty page space below the last paragraph (the current mobile gap)
- The left/right page margins
- The reserved top strip (below the top bar when chrome is ON, i.e. the area around the muted title) and the reserved bottom strip (around the muted counter)
- Blank surfaces of the chrome bars themselves when they are visible (the bars' backgrounds are not interactive; their buttons are)

Taps that begin a swipe/flick page turn must not toggle: a drag that ends in a page turn cancels the tap (web: the existing post-drag click suppression; mobile: the pan gesture cancels the press). A drag that snaps back is a tap-cancel too — it must not toggle.

### 5.2 The red paint test (acceptance criterion)

A temporary debug switch paints the tap surface red (a dev-only class/style on the tap surface; `[LP Web]`/`[LP Mobile]`-gated). With the paint on:

- The red area must cover **100% of the screen** in both chrome states — including the area below the last paragraph and the reserved strips.
- Interactive elements (tokens, links, buttons, the close button, the bars' controls, inputs) must **not** be red and must still work when tapped.
- Tapping any red pixel toggles the chrome; tapping a non-red element does its own thing.

### 5.3 Implementation approach

- **Web** (`paginated-reader.tsx`): move the immersive blank-tap click listener from `pager.viewportRef.current` to the reader's outermost padded container (the `relative … flex flex-col` element that carries `immersiveReserve` as padding). It spans the full reader area including both strips. The existing guards stay: ignore when text is selected; `closest('a, button, input, textarea, select, [contenteditable="true"]')` excludes interactive elements. The existing post-drag click suppression on the viewport is registered in the capture phase, so it still stops the container-level listener after a flick (§7.2 of SPEC-077's behavior, already implemented).
- **Mobile** (`PaginatedReader.tsx`): when `immersive && onToggleChrome`, make the **root of the padded container** the tap surface instead of wrapping only the visible blocks: a single `Pressable` around the whole padded container (or a full-screen `Pressable` at the bottom of its z-order with the `ScrollView` above it). Nested `Pressable`s (tokens, links, chevrons, switch, TOC/Search) claim their own touches; the `ScrollView` claims movement (canceling the press on a swipe), so blank areas — including below the last paragraph — land on the surface. Keep the overlays and measuring view `pointerEvents="none"`.

## 6. Geometry: the two strips and the clearance rules

### 6.1 Symbols

| Symbol | Meaning |
|---|---|
| `S` | screen height (web: viewport height; mobile: window height) |
| `H` | site top bar (app header) height, border included |
| `BAR_H` | bottom bar height, border included |
| `T` | top reserved strip height |
| `B` | bottom reserved strip height |
| `LINE` | height of one muted overlay line (`text-xs`, ≈ 16 px) |

### 6.2 Rules

- **Top rule:** title line and close button must be **≥ 8 px below the top bar's bottom edge** (at `y = H`) whenever the chrome is visible.
- **Bottom rule:** the page counter must be **≥ 8 px above the bottom bar's top edge** (at `y = S − BAR_H`) whenever the chrome is visible.
- **Reserve formulas** (constants per composition, never per state):

```
T = H + 8 + LINE + 8          (top bar + clearance + title line + breathing room)
B = BAR_H + 8 + LINE + 8      (bottom bar + clearance + counter line + breathing room)
```

- **Overlay positions** (identical in both chrome states):

```
title line box   y ∈ [H + 12, H + 12 + LINE]
close button     y ∈ [H + 8,  H + 32]        (24 px circle, right-aligned, centered on the title line)
counter line box y ∈ [S − BAR_H − 24, S − BAR_H − 8]      (= [S − B + 8, S − B + 8 + LINE])
```

- **Text viewport:** `[T, S − B]`. The paginator measures against exactly this; first text line starts at `T`, last ends at `S − B`.
- **Horizontal layout:** let `L` be the rendered L2 body-text line height (`16 px × zoom × text scale × leading`, rounded to a whole pixel). The reader content uses `padding-left: L` and `padding-right: 16 px`; when L2 and L1 are side by side, their visible gap is `L` (accounting for the split-handle footprint when present). These values are layout constants for a composition, not per-page values.

Check the clearance with these formulas (the bar's bottom edge is at `H`, its border included):

- Title top `H + 12` — 12 px below the bar's bottom edge ≥ 8 ✓.
- Close top `H + 8` — exactly 8 px below the bar's bottom edge ✓.
- Counter bottom `S − BAR_H − 8` — exactly 8 px above the bar's top edge ✓; counter top `S − BAR_H − 24` leaves 8 px between the counter and the last text line (`S − B = S − BAR_H − 32`) ✓.

### 6.3 Concrete constants

**Web** (`epub/page.tsx`, `paginated-reader.tsx`):

| Constant | Value | Derivation |
|---|---|---|
| `H` | 57 | header `h-14` (56) + 1 px `border-b` |
| `T` | **89** | `57 + 8 + 16 + 8` (was 57) |
| `B` | **73** | `BAR_H + 32` with `BAR_H = 41` (was 65) |
| Title line | `[69, 85]` | `[H + 12, H + 28]` |
| Close button | `top 65, right 12` | `[H + 8, H + 32]` |
| Counter line | `[S − 57, S − 41]` | `[S − BAR_H − 24, S − BAR_H − 8]` |

`BAR_H` must equal the rendered height of the bottom bar (≈ 41 px today: 8 top padding + 24 button row + 8 bottom padding + 1 border). If the bar composition changes, re-derive `B`; do not hard-code a stale number. If a component's rendered size ever disagrees with the constant, log the mismatch (`[LP Web]`) rather than silently mis-reserving.

The immersive page wrapper must be a flex column so the nested `PaginatedReader` can
stretch to the full `h-screen` frame. A `flex-1` child inside a non-flex wrapper does
not consume the available page height and causes short books/pages to leave unused
space below the bottom bar.

The EPUB reader's horizontal padding must derive from `L`, not a fixed `px-1` class.
The same left/right padding must be applied to the visible content, the hidden measuring
mirror, and any width used for pagination so adding the margin
does not change the measured-vs-rendered line wraps.

**Mobile** (`epub.tsx`, `PaginatedReader.tsx`):

| Constant | Value | Derivation |
|---|---|---|
| `H` | `insets.top + 57` | header = `insets.top + 8 + 40 + 8 + 1` |
| `T` | `H + 32` = `insets.top + 89` | was `insets.top + 57` |
| `B` | `BAR_H + 32` = `59 + insets.bottom` | `BAR_H = 27 + insets.bottom` (8 pt + 18 icon + 1 border + inset) |
| Title line | `[H + 12, H + 28]` | — |
| Close button | `top H + 8 = insets.top + 65, right 12` | was `insets.top + 6` |
| Counter line | `[S − BAR_H − 24, S − BAR_H − 8]` | — |

Changing `T`/`B` re-paginates once (pages become slightly shorter). That is expected and acceptable: the strips are constants, so the re-pagination happens exactly once on layout, and chrome toggling still never reflows.

## 7. State A — Chrome ON

```
  0 ┌──────────────────────────────────────────────────────────────┐
    │  ◐ logo   Home  Explore  Reader  ▸▸       ⌕     ☰           │ ┐
    │                                                              │ │  SITE TOP BAR (app header)
    │                                                              │ │  slides down with the chrome
    │                                                              │ │  height H = 57 (web)
  H ├──────────────────────────────────────────────────────────────┤ ┘  bar bottom edge
    │                                                              │ ┐  ≥ 8 px clearance
    │                        CHAPTER TITLE               (X)       │ │  title line  [H+12, H+28]
    │                                                              │ │  close (X)   [H+8,  H+32]
  T ├──────────────────────────────────────────────────────────────┤ ┘  text starts at T = H + 32
    │                                                              │
    │   一、坊っちゃんの生ひ立ち                                    │
    │   親譲りの無鉄砲で子供の時から損ばかりしている。              │     TEXT AREA (paginated)
    │   小学校に居る時分学校の二階から飛び降りて一週間ほど          │     viewport = [T, S − B]
    │   腰を抜かした事がある。                                     │
    │   ……                                                        │
    │                                                              │
  B ├──────────────────────────────────────────────────────────────┤ ┐  text ends at S − B
    │                       page 42 / ~612                         │ │  counter line [S−BAR_H−24, S−BAR_H−8]
    │                                                              │ │  ≥ 8 px above the bar
  C ├──────────────────────────────────────────────────────────────┤ ┘  bar top edge at S − BAR_H
    │   ◀   42 / ~612   ▶    │  Translation  [on]     ▤    ⌕       │ ┐
    │                                                              │ │  BOTTOM BAR — pagination +
    S └────────────────────────────────────────────────────────────┘ ┘  toggles (height BAR_H ≈ 41 web)
```

### 7.1 Element-by-element (chrome ON)

| Element | Position | Notes |
|---|---|---|
| Site top bar | `[0, H]`, full width | The app header, re-rendered by the reader overlay (`ReaderChromeProvider immersed={false}`); slides down over the top strip. Interactive: logo, nav, search, menu. |
| Chapter title | line box `[H+12, H+28]`, centered, `max-width 85%`, truncates | Muted (`text-muted-foreground`, `text-xs`); **always visible**, this state included. `pointer-events: none`. |
| Close button | 24 px circle at `top H+8`, `right 12` | Visible **only when chrome is ON** (fades in); same position when hidden. Interactive. |
| Text | `[T, S − B]` | Paginated; identical layout in both chrome states. |
| Page counter | line box `[S−BAR_H−24, S−BAR_H−8]`, centered | Muted, always visible, `pointer-events: none`. Also shown inside the bottom bar (the in-bar readout is separate). |
| Bottom bar | `[S − BAR_H, S]`, full width | Chevrons + readout + translation toggle + TOC + Search. Interactive controls; blank bar background is part of the tap surface. |
| Tap surface | entire screen minus §5.1 exclusions | Tapping any blank pixel (including the strips) toggles to chrome OFF. |

## 8. State B — Chrome OFF

```
  0 ┌──────────────────────────────────────────────────────────────┐
    │                                                              │ ┐
    │                                                              │ │  TOP STRIP reserved (T px)
    │                                                              │ │  top bar slid away — nothing
    │                                                              │ │  occupies this space
    │                                                              │ │  title line [H+12, H+28]
    │                        CHAPTER TITLE                         │ ┘  close button hidden
    │                                                              │
  T ├──────────────────────────────────────────────────────────────┤    text starts at T (same as ON)
    │                                                              │
    │   一、坊っちゃんの生ひ立ち                                    │
    │   親譲りの無鉄砲で子供の時から損ばかりしている。              │     TEXT AREA — identical
    │   ……                                                        │     pagination to chrome ON
    │                                                              │
    │                                                              │
  B ├──────────────────────────────────────────────────────────────┤ ┐
    │                       page 42 / ~612                         │ │  counter — same position as
    │                                                              │ │  chrome ON
    │                                                              │ │  BOTTOM STRIP reserved (B px)
    │                                                              │ │  bottom bar slid away
  S └──────────────────────────────────────────────────────────────┘ ┘
```

### 8.1 Differences from chrome ON

- The site top bar and the bottom bar are off-screen (slide/fade out), the close button is hidden (fades out).
- Everything else is pixel-identical: title and counter at the exact same offsets, text pagination unchanged, tap surface still the full screen.
- The reader feels "clean": only the muted chapter title, the page text, and the muted page counter.

## 9. The Search modal

### 9.1 Requirements

1. **Fixed height, independent of the result count.** The modal's height may depend only on the viewport (`min(70vh, 560 px)` web; `70%` of the window height mobile, capped). An empty result set, one result, or 200 results produce the exact same modal height.
2. **A reserved results area in every state.** The region between the search bar and the modal's bottom always exists and always has the same size. It shows, in turn: the **initial state** (no query yet — recent searches if any, otherwise a neutral "search the book" hint), the **loading** state (spinner row), the **empty** state ("no results"), or the **results list** (scrollable).
3. **The search bar is pinned** directly under the modal header and never scrolls or re-positions. Because the modal height is fixed and the bar is at the top, the bar stays **well above the software keyboard** regardless of results. On mobile, the modal additionally rides up with the keyboard (`KeyboardAvoidingView`) so even a tall keyboard cannot reach the bar.

### 9.2 Layout

```
 ┌──────────────────────────────────────────────────────────┐
 │  ░  dimmed backdrop — absorbs taps (never toggles chrome)│
 │                                                          │
 │   ┌──────────────────────────────────────────────────┐   │
 │   │  SEARCH — fixed height H_S, e.g. min(70vh, 560px)│   │
 │   │  ┌────────────────────────────────────────────┐  │   │
 │   │  │ Search                                (X) │  │   │  header — shrink-0
 │   │  └────────────────────────────────────────────┘  │   │
 │   │  ┌────────────────────────────────────────────┐  │   │
 │   │  │ [ search the book …………………… ]  ⌕  │  │   │  search bar — shrink-0, pinned
 │   │  └────────────────────────────────────────────┘  │   │
 │   │  ┌────────────────────────────────────────────┐  │   │
 │   │  │                                            │  │   │  RESULTS AREA — flex-1,
 │   │  │              ⌕                             │  │   │  always present, always
 │   │  │         Search this book…                  │  │   │  the same size (empty
 │   │  │                                            │  │   │  state shown here)
 │   │  └────────────────────────────────────────────┘  │   │  scrolls internally when
 │   └──────────────────────────────────────────────────┘   │  results exist
 │                                                          │
 └──────────────────────────────────────────────────────────┘
```

### 9.3 Structure (both platforms)

```
Modal (fixed height H_S)
├── header row          — title "Search" + close (X)          shrink-0
├── search bar row      — input + submit                       shrink-0
└── results area        — flex-1, min-h-0, overflow-y-auto     the reserved region
      ├── initial (no query): recent searches, or empty-state hint
      ├── searching: spinner row
      ├── zero results: "No results" centered
      └── results: scrollable list (snippet + chapter label)
```

The results area is the **only** scrolling region. The search bar and header never scroll away.

### 9.4 Empty-state content

- **Initial state, no recents:** a centered hint — the search icon at reduced opacity plus the search placeholder text ("Search this book…"). This is what guarantees the bar's height above the keyboard *before the user types anything*.
- **Initial state, with recents:** the recent-searches list occupies the results area (same size).
- **Zero results:** the "No results" message, centered in the same area.
- All states keep the area's height; only the content swaps.

### 9.5 Keyboard behavior (mobile)

- The modal is centered vertically at rest. With the keyboard open, a `KeyboardAvoidingView` (`behavior="padding"` iOS / `"height"` Android) shifts the whole modal up so the search bar clears the keyboard; the fixed height + pinned bar make this robust on short screens.
- The input keeps `autoFocus` (mobile) so the keyboard opens with the modal.
- `keyboardShouldPersistTaps="handled"` so tapping a result (or the close button) works while the keyboard is up.

## 10. The Chapters (TOC) modal

The chapters modal is a **list dialog** — no input, no keyboard concern — so its height is content-driven up to a cap (web `max-h-[80vh]`, mobile `max-h-[85%]`), with the list scrolling internally. It is documented here for completeness and parity between the apps.

```
 ┌──────────────────────────────────────────────────────────┐
 │  ░  dimmed backdrop                                      │
 │                                                          │
 │   ┌──────────────────────────────────────────────────┐   │
 │   │  Chapters                                 (X)   │   │  header — shrink-0
 │   │  ‹ Previous chapter      Next chapter ›         │   │
 │   ├──────────────────────────────────────────────────┤   │
 │   │  ▸ はじめに                                       │   │
 │   │  ▸ 一、坊っちゃんの生ひ立ち              ◂ now   │   │  TOC LIST — flex-1,
 │   │     ▸ 二、私が赤シャツを嫌いになった訳            │   │  min-h-0, scrolls
 │   │  ▸ 三、…                                          │   │  indentation = TOC depth
 │   │  …                                               │   │  current entry (and its
 │   └──────────────────────────────────────────────────┘   │  ancestors) highlighted
 │                                                          │
 └──────────────────────────────────────────────────────────┘
```

Elements:

- **Header (shrink-0):** "Chapters" title + previous/next-chapter buttons + close (✕).
- **TOC list (flex-1, min-h-0, scrolls):** the full `TocNode` hierarchy; indentation reflects depth; the current entry and its ancestors are highlighted; tapping an entry closes the modal and jumps.

> **Revision (post-SPEC-085):** the "N chapters" **footer was removed on both
> web and mobile** (the chapters dialog is now header + scrollable list only,
> no chapter-count bar). A drag-out of the dialog is a plain list; there is no
> summary strip.

## 11. Behavior matrix

| Action | Result |
|---|---|
| Tap blank area (anywhere on screen) | Toggles chrome ON ↔ OFF |
| Tap a word token | Opens the dictionary (unchanged); never toggles |
| Tap a link / button / control / input | Its own action (unchanged); never toggles |
| Tap during an active text selection (web) | Nothing (selection UX); never toggles |
| Swipe/flick page turn | Turns the page (unchanged); never toggles |
| Tap while a modal is open | Hits the modal backdrop; never toggles the reader chrome |
| Tap on the muted title / page counter | Toggles (the overlays are transparent to input) |
| Chrome ON: tap on blank top-strip area | Toggles OFF (header slides away) |
| Chrome ON: tap on blank bottom-strip area | Toggles OFF (bar slides away) |
| Chrome ON: tap on a header control | Runs the control's action; never toggles |
| Resize / rotate / font change | Re-paginates (unchanged); overlays and strips stay constant |

## 12. Edge cases

- **Short screens / small windows:** the formulas are proportional (`S` drops out); on very short windows the strips still apply and the text viewport shrinks accordingly. No strip can be skipped to win back space.
- **Landscape phones:** `BAR_H` includes `insets.bottom` (home indicator); the counter clearance is measured from the bar's top edge, which already sits above the inset.
- **RTL books:** no change — the tap surface and the overlay geometry are direction-agnostic; page-order mirroring is out of scope (unchanged from SPEC-032).
- **Book with no TOC:** the TOC button/modal is omitted; everything else (tap surface, strips, counter, search) is unaffected.
- **The close button's hit area when chrome is OFF:** it is hidden (`pointer-events: none` / `opacity: 0`), so the area it would occupy is part of the tap surface.
- **The hidden measuring mirror:** already `pointer-events: none`; must stay that way so the full-screen surface works.
- **Dictionary popup open:** it is a body-portaled dialog (web) / its own overlay; taps inside it never reach the reader surface.
- **Quitting a dialog must not toggle the chrome:** the click that DISMISSES a dialog (popup dictionary, TOC, Search) can fall through to the tap surface after the overlay unmounts — web: a slow click-and-hold whose `click` fires after the Radix overlay is removed re-targets to the reader surface; mobile: the dismissing tap can land on the surface once the overlay's pointerEvents flip to `'none'`. A shared reader-tap-guard (`apps/web/src/lib/reader-tap-guard.ts`, `apps/mobile/lib/reader-tap-guard.ts`) arms `suppressReaderTap()` on every reader-dialog close; the tap handlers (`paginated-reader.tsx`, the epub page's root `onClick`, mobile `toggleChrome`) ignore taps inside the window. On web, taps are also ignored while any dialog overlay is still mounted (open or animating out) — see §11 "Tap while a modal is open".
- **Strip constants drift:** if the header or bar is ever resized in a later change, `T`/`B` must be re-derived from the formulas; keep the constants next to their components with a comment, and log a mismatch if a runtime measurement disagrees.

## 13. Implementation notes

### 13.1 Web

- `apps/web/src/components/reader/paginated-reader.tsx`
  - Move the immersive tap listener from `pager.viewportRef.current` to the padded container (add a ref to the `relative … flex flex-col` root). Keep the selection and `closest(...)` guards. The existing capture-phase click suppression after a drag still prevents drags from toggling.
  - No layout change needed here: the strips are passed in as `immersiveReserve` from the page.
- `apps/web/src/app/[l1]/[l2]/epub/page.tsx`
  - `TOP_CHROME_RESERVE` → 89, `BOTTOM_CHROME_RESERVE` → 73 (or derive: `H + 32`, `BAR_H + 32` with `BAR_H` = measured bar height).
  - Close button: `top-1.5` → `top-[65px]` (or `top-[H+8]`), keep `right-3`.
  - `topOverlay`: change the overlay container's top inset so the title line box starts at `H + 12` (69 px); keep it centered/truncated and `pointer-events: none` (already via the overlay wrapper).
  - `pageInfoOverlay`: change the overlay container's bottom inset so the counter line box sits at `[S − BAR_H − 24, S − BAR_H − 8]` (`pb` computed from the new `B`).
- `apps/web/src/components/reader/epub-search-panel.tsx` + `epub/page.tsx` (search dialog)
  - `DialogContent`: replace `max-h-[80vh]` with a fixed `h-[min(70vh,560px)]` (keep `flex flex-col`, `sm:max-w-lg`, `z-[70]`).
  - Restructure the panel so the header + search bar are `shrink-0` and the results region is `flex-1 min-h-0 overflow-y-auto`; the panel's own root becomes `flex min-h-0 flex-1 flex-col`.
  - Add the empty-state placeholder for the initial state (no query, no recents) and center the no-results message in the reserved region.
- The chapters dialog already has the right column structure (`DialogHeader` shrink-0, `flex-1 overflow-y-auto` list). The former "N chapters" footer was removed; verify only.

### 13.2 Mobile

- `apps/mobile/components/reader/PaginatedReader.tsx`
  - Replace the blocks-only `Pressable` with a tap surface that covers the whole padded container (root `Pressable` when `immersive && onToggleChrome`, or a full-screen `Pressable` beneath the `ScrollView`). Nested interactive `Pressable`s keep claiming their touches; keep the measuring view and overlays `pointerEvents="none"`.
- `apps/mobile/app/(tabs)/(reading)/epub.tsx`
  - `TOP_CHROME_RESERVE` → `insets.top + 89`, `BOTTOM_CHROME_RESERVE` → `59 + insets.bottom`.
  - Close button: `top: insets.top + 6` → `top: insets.top + 65`.
  - `topOverlay`: title starts at `insets.top + 69`.
  - `pageInfoOverlay`: counter bottom at `BAR_H + 8` above the window bottom (derived from `B`).
- `apps/mobile/components/reader/EpubSearchPanel.tsx` + `epub.tsx` (search modal)
  - Modal container: fixed `height: '70%'` (capped), flex column; header + `SearchBar` shrink-0; results region `flex-1` with the `ScrollView` inside (drop the `max-h-[70%]` scroll wrapper).
  - Wrap the modal content in `KeyboardAvoidingView` (padding/height) so the bar clears the keyboard; keep `keyboardShouldPersistTaps="handled"` and `autoFocus`.
  - Add the initial empty-state hint region (icon + "search the book") so the reserved area exists before any query.
- The chapters modal already has the right structure (header row, scroll list). The "N chapters" footer that was added for web parity (this spec previously claimed mobile had no footer) was removed on both apps; verify only.

### 13.3 Shared

- No shared-package changes: this is view-layer work in both apps (AGENTS.md — UI is not shared).
- Translation keys: reuse existing keys (`title.chapters`, `action.search`, `action.close`, `msg.no_results`, `placeholder.search` / `placeholder.search_dots`, `msg.result_count`). The `msg.chapters` key (used by the removed chapters footer) is now unused in code but retained in the CSV. A dedicated empty-state hint ("Search this book…") can reuse the search placeholder keys; no new keys are required.

## 14. Files changed

| File | Change |
|---|---|
| `apps/web/src/components/reader/paginated-reader.tsx` | Tap listener moves to the padded container (full-screen surface) |
| `apps/web/src/app/[l1]/[l2]/epub/page.tsx` | New `T`/`B` constants; title/close/counter offsets; search dialog fixed height |
| `apps/web/src/components/reader/epub-search-panel.tsx` | Pinned search bar + reserved results/empty area |
| `apps/web/src/lib/reader-layout.ts` | Web leading-based reader padding and geometry helper |
| `apps/mobile/components/reader/PaginatedReader.tsx` | Full-screen tap surface (root Pressable) |
| `apps/mobile/app/(tabs)/(reading)/epub.tsx` | New reserves; title/close/counter offsets; search modal fixed height + `KeyboardAvoidingView` |
| `apps/mobile/components/reader/EpubSearchPanel.tsx` | Reserved empty results area |
| `docs/arch/013-epub-reader-architecture.md` | Update chrome/strip description once implemented |

## 15. Verification plan

- **Red paint test** (§5.2): debug-paint the tap surface; confirm it covers 100% of the screen in both chrome states on web (desktop + touch) and mobile (simulator + device); confirm every excluded element is unpainted and functional.
- **Clearance checks:** with chrome ON, measure (web: devtools; mobile: screenshot) that the title line top and close button top are ≥ 8 px below the top bar's bottom edge, and the counter's bottom is ≥ 8 px above the bottom bar's top edge. Repeat at the largest text scale and with the translation split at its extremes.
- **No-reflow invariant:** toggle chrome repeatedly; assert the page number, the first visible block, and the text layout never change (only overlays move).
- **Full-height frame:** on a short page, confirm the reader root and bottom bar reach the viewport bottom; the text viewport occupies `[T, S − B]` rather than collapsing to content height.
- **Leading margin parity:** at default and non-default leading/text-scale settings, confirm the web left text margin and side-by-side text/translation gap match the rendered L2 leading; confirm visible and measured line wraps remain identical.
- **Search modal:** with 0, 1, and 200 results (and in the initial state), assert the modal height is identical and the search bar's position is identical. On mobile, open the keyboard and assert the bar stays above it.
- **Regression:** word lookup, links, prev/next page, page-number tap, translation toggle, TOC jump, search jump + highlight, close, back-stack, and position restore all still work; swiping/flicking never toggles the chrome; tapping during a selection never toggles.
- **Typecheck:** `cd apps/web && ./node_modules/.bin/tsc --noEmit`; `cd apps/mobile && ./node_modules/.bin/tsc --noEmit`.

## 16. Open questions

1. **Blank chrome surfaces toggle:** this spec treats the top/bottom bars' blank backgrounds as part of the tap surface (their buttons excluded). If product prefers bars to be fully inert, exclude the bar regions wholesale — a one-line guard.
2. **Strip constants vs. runtime measurement:** the formulas assume constant `H`/`BAR_H`. If the header/bottom bar ever become responsive (e.g., different heights at breakpoints), the strips should derive from measured heights with a mismatch log instead of hard-coded constants.
3. **Search modal height cap:** `min(70vh, 560 px)` (web) / `70%` (mobile) are starting points; confirm against tablet sizes (iPad landscape) where the modal might feel short or tall.

## 17. Revision (2026-08-25) — chromeless controls and horizontal geometry

### 17.1 Close button now lives in CHROMELESS mode only

§7.1/§8.1 previously had the close button visible only when the chrome is ON.
Per product direction (paginated reader requirements), the affordance flipped:

- **Chrome OFF (chromeless):** standard **shadcn buttons** (rectangular,
  rounded corners — not 24 px circles) sit top-right, **vertically centred on
  the site top bar's middle** (revised 2026-09-01 — they previously aligned
  with the chapter title). The bar spans `y ∈ [0, H]` (mobile:
  `H = insets.top + 57`), so a 36 px `h-9` button gets
  `top = (H − 36) / 2` — web: `top = (HEADER_HEIGHT − 36) / 2 = 10.5`
  (center y 28.5); mobile: `top = (insets.top + 57) / 2 − 18` (the full bar,
  safe-area inset included, matches the web math): **"show toolbars"**
  (reveals the chrome) and **"close"** (leaves the reader). Text labels show
  on **portrait iPad and wider** (≥ 768 px, the same breakpoint as
  side-by-side translation); below that they collapse to icons. On wide
  screens the label is the action string (`action.show_toolbars` /
  `action.close`); the close button's **right edge lines up with the
  per-block action-menu trigger (⋮)** in the text below — see §17.2.
- **Back to page {n} (2026-09-02):** a third chromeless button appears to the
  LEFT of "show toolbars" **only while an in-book jump is undoable** — i.e.
  after a search-navigation, chapter-navigation, or internal-link jump
  pushed the pre-jump page onto the history stack. Pressing it pops the
  stack and returns to the page the jump was made from (label
  `action.back_to_page`, icon-only below 768 px). Plain page turns never
  push history, so the button stays hidden during normal reading. Both
  platforms (web `historyRef` + `historyPageRef`; mobile the same via
  `pagination.page`).
- **Chrome ON:** no close button. Escape hatches are the chromeless close and
  the nav-menu same-route close (`requestCloseReader`).

> **Removed on mobile (2026-08-29):** the nav-menu same-route close
> (`requestCloseReader` / `registerCloseReader`) is **disabled on mobile**. It
> could feed back into the epub auto-open effect and create an open→close→reopen
> loop where a book could never be opened, so the nav item is a plain navigation
> again on mobile. Leaving the reader uses the chromeless close button and the
> back stack. The dormant request/register API is retained in
> `ReaderChromeContext` for a later, safe re-introduction; web is unaffected
> (web was never wired through this path).

### 17.2 Horizontal geometry — content-container clamp + symmetric leading margins

§6.2 previously specified `padding-left: L` / `padding-right: 16px`. The
reader now clamps the text column to the **content container width** (the
top bar's content span, logo → avatar) and uses **leading margins on both
sides**:

- `CONTENT_CONTAINER_WIDTH = 1248` (web `lib/reader-layout.ts`, mobile
  `lib/reader-layout.ts`) — the `max-w-7xl` (1280 px) container minus its
  16 px horizontal padding on each side.
- **Rule:** the text column's maximum width is
  `min(CONTENT_CONTAINER_WIDTH, screen width − 2 × L)`, where `L` is the
  rendered L2 body-text leading. On phones the "screen − 2L" bound wins (the
  column fills the screen with a leading margin on each side); on wide
  screens the container width wins (the column matches the header's
  logo→avatar span).
- Web: the shared `readerHorizontalPadding(zoom, leading)` style object
  returns `{ paddingLeft: L, paddingRight: L, maxWidth:
  CONTENT_CONTAINER_WIDTH + 2L, marginLeft: 'auto', marginRight: 'auto' }` —
  applied to the visible content AND the hidden measuring mirror so measured
  line wraps match.
- Mobile: `readerClampedContentWidth(available)` clamps the pagination
  hook's `contentWidth` to `CONTENT_CONTAINER_WIDTH`; the visible ScrollView
  wraps blocks in a centered View of that width and the measuring mirror is
  set to `contentWidth + 2 × L`.
- Vertically, short pages (immersive epub) are centered like a book page
  (web: `flex min-h-full flex-col justify-center` on the visible column;
  mobile: `contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}`).

#### The chromeless close button's right edge mirrors the action-menu trigger

Because the text column is a centered, width-clamped box, the per-block
action-menu trigger (⋮, at the end of each block row) sits at the content
column's right edge — not at a fixed `right` inset. The chromeless close
button's **right edge must line up with that trigger's right edge**, so its
offset from the screen's right edge is **not** a constant 12 px:

```
closeButtonRight = max(L, (screen width − CONTENT_CONTAINER_WIDTH) / 2)
```

- On narrow screens (`screen − 2L ≤ CONTENT_CONTAINER_WIDTH`) the column fills
  the screen minus a leading margin on each side, so the margin is `L` (the
  leading).
- On wide screens the column is the centered container, so the margin is
  `(screen − CONTENT_CONTAINER_WIDTH) / 2`.
- Applies to web (`epub/page.tsx`, `right = closeRightMargin`) and mobile
  (`epub.tsx`, `right = closeRightMargin`), recomputed on window resize
  (web) / from `useWindowDimensions` (mobile). The "show toolbars" button sits
  to the left of the close button; both share the same right-anchored row.
