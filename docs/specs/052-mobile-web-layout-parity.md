# SPEC-052 — Mobile ↔ Web Layout Parity (iPad-First)

## Metadata

- **Spec ID**: SPEC-052
- **Feature**: Bring `apps/mobile` layout behavior in line with `apps/web` at every screen-size breakpoint
- **Status**: in-progress (phases 1–6 implemented; review fixes landed 2026-08-07; Phase 7 manual QA pending)
- **Created**: 2026-08-07
- **ROADMAP Phase**: Phase 8 — iPad & Responsive Layout
- **Scope**: `apps/mobile` only; `apps/web` is the reference implementation
- **Related specs**: [SPEC-020 — iPad & Responsive Layout](020-ipad-responsive-layout.md) · [SPEC-049 — Web → Mobile Feature Parity](049-mobile-feature-parity.md) · [SPEC-050 — Mobile Sidebar & Video Layout Parity](050-mobile-sidebar-video-parity.md) · [SPEC-051 — Mobile Text-Scale Parity](051-mobile-text-scale-parity.md) · [ADR-0010 — Fresh Mobile Port](../adr/0010-port-web-to-mobile-fresh-start.md) · [ADR-0014 — Interaction Primitives Strategy](../adr/0014-rn-primitives-interaction-primitives.md) · [ADR-0015 — Settings UI and Search](../adr/0015-settings-ui-and-search.md)

---

## Overview

`apps/web` uses Tailwind breakpoints (`sm` 640, `md` 768, `lg` 1024, `xl` 1280) and a per-route max-width model to adapt every page from phone to desktop. `apps/mobile` has no CSS breakpoint system. It uses a handful of JS thresholds in individual components (`400`, `600`, `640`, `700`, `768`, `900`, `1000`, `1200`), a single `max-w-3xl` page container for most routes, and no persistent header navigation on any width.

This spec records the current route-by-route layout gap and defines a step-by-step plan to make mobile match web at each breakpoint, with iPad as the primary target.

The goal is **layout parity**, not identical code. Mobile still uses React Native primitives and NativeWind, but the visual structure — columns, sidebars, max widths, side-by-side regions, and breakpoints — should match web.

**As of 2026-08-07:** phases 1–6 are implemented on branch
`codex/mobile-web-layout-parity`. A review pass found and fixed the issues
documented in [Review fixes](#review-fixes-2026-08-07) and the
[Bottom-sheet policy](#bottom-sheet-policy-2026-08-07) below. Phase 7 (manual
verification on device/simulator) is the remaining work before this spec can
be marked complete.

---

## User Stories

- As an iPad user in portrait (820px), I want the same column counts and content widths as web at `md`, so media pages don't feel sparse or stretched.
- As an iPad user in landscape (1180px), I want side-by-side layouts (Live TV, Local Media, dictionary entry, readers) instead of stacked phone layouts.
- As a user in iPad split view or Slide Over (~320–438px), I want the phone layout to remain usable with capped drawers and one-column grids.
- As a user on a large window (>1280px), I want the same content caps and grid columns as web so lines don't become unreadable.

---

## Relationship to existing specs

- **SPEC-020** identified iPad issues and some fixes are already landed (orientation unlock, responsive `VideoGrid`, `PageContainer`, settings sidebar cap). This spec supersedes the remaining open items with a route-by-route target.
- **SPEC-050** delivered the shared mobile `Sidebar`. This spec changes its wide/narrow breakpoint from 768 to web's 1024 and applies it consistently.
- **SPEC-051** covered text-scale parity. This spec covers structural layout only; no text-scale changes are required.
- **SPEC-049** tracks feature parity. This spec is about *layout* parity for features that already exist on both platforms.

---

## Target breakpoint model

Mobile should use the same effective breakpoints as web:

| Web breakpoint | Width | Mobile behavior after |
|---|---|---|
| default | <640 | Phone layout: 1-column grids, drawer nav, stacked panels |
| `sm` | 640–767 | 2-column grids, app name visible, no persistent nav yet |
| `md` | 768–1023 | Persistent header nav; 2-column grids stay 2-column until lg |
| `lg` | 1024–1279 | Persistent sidebars, side-by-side panels, 3-column grids |
| `xl` | ≥1280 | 4-column grids, 5-column EPUB shelf, docs TOC sidebar where applicable |

### Current mobile thresholds vs target

| Surface | Current mobile threshold(s) | Target (web-equivalent) |
|---|---|---|
| `VideoGrid` | <400 → 1, <700 → 2, <1000 → 3, ≥1000 → 4 | <640 → 1, <1024 → 2, <1280 → 3, ≥1280 → 4 |
| Saved words grid | <640 → 1, <900 → 2, <1200 → 3, ≥1200 → 4 | <640 → 1, <1024 → 2, <1280 → 3, ≥1280 → 4 |
| TV shows grid | always 2 | <640 → 1, <1024 → 2, <1280 → 3, ≥1280 → 4 |
| Sidebar | <768 sheet, ≥768 persistent | <1024 sheet, ≥1024 persistent |
| Settings split | ≥600 (if detail ≥320) | ≥1024 |
| Header nav | never persistent | persistent ≥768 |
| Header app name | visible ≥640 | always visible |
| Language picker | <640 tabs, ≥640 bi-panel | <640 tabs, ≥640 bi-panel (already matches) |
| EPUB bookshelf | <520 → 2, <720 → 3, ≥720 → 4 | <640 → 2, <768 → 3, <1280 → 4, ≥1280 → 5 |
| Image search grid | always 3 | 3 <640, 4 ≥640 |

---

## Current state: already in place

> Baseline captured when this spec was written. The "Implementation status"
> section below records what changed in phases 1–6.

| Item | Status |
|---|---|
| Orientation unlocked (`"orientation": "default"`, `supportsTablet: true`) | ✅ |
| Shared `PageContainer` with `max-w-3xl` | ✅ (needs widening/variants) |
| Responsive `VideoGrid` (JS columns) | ✅ (thresholds need alignment) |
| Settings wide split with capped sidebar | ✅ (threshold/width need alignment) |
| Shared `Sidebar` sheet/persistent panel | ✅ (breakpoint needs alignment) |
| Watch player wide/narrow aspect-ratio layout | ✅ (near parity) |
| Language picker 640 breakpoint | ✅ |
| `TabbedPanel` measurement-based label collapsing | ✅ |

---

## Implementation status (phases 1–6)

| Phase | Status | Key changes |
|---|---|---|
| 1 — Responsive foundation | ✅ | Added `SM/MD/LG/XL_BREAKPOINT`, `gridColumnCount()`, `useResponsive()`, and `PageContainer maxWidth` variants (`2xl`–`7xl`, `full`) |
| 2 — Grid parity | ✅ | `VideoGrid`, Music, Search, TV Shows, Saved Words, EPUB shelf, and image search now use web-equivalent columns |
| 3 — Shell and navigation | ✅ | Persistent `NavBar` at ≥768, hamburger drawer only below 768, app name always visible |
| 4 — Sidebar and split layouts | ✅ | `SIDEBAR_BREAKPOINT` → 1024, settings split → 1024 with Display default, 220px sidebar, `max-w-lg` detail, dictionary entry capped at 1280 |
| 5 — Side-by-side surfaces | ✅ | Live TV, Local Media, reader translations, and review padding now follow web's lg layout |
| 6 — Remaining route widths | ✅ | Auth `max-w-md`, tokenizer `max-w-2xl`, list route caps, profile/go-pro plan grids, playlists card grid, go-pro success/error alignment, docs deviation recorded |
| 7 — Verification and documentation | ⬜ | Typecheck passes; manual iPad matrix not yet run |

### Review fixes (2026-08-07)

An implementation review of the phase 1–6 commits found four issues. All four
are fixed on this branch:

| Fix | Problem found | Change |
|---|---|---|
| Video grid card tiling | `FlatList` multi-column rows don't auto-equalize item widths; `VideoCard` had no `flex: 1`, so iPad grids rendered as stretched/overflowing single cards | `VideoGrid` now wraps each card in a `flex: 1` cell when `numColumns > 1` (matches TV shows / playlists / saved-words pattern) |
| Local Media width cap | Side-by-side player + transcript was implemented without web's `max-w-7xl` cap, so >1280px windows stretched content full-width | Screen now uses `PageContainer maxWidth="7xl"`; player width math accounts for the row padding + gap so aspect ratio and seek bar stay accurate |
| NavBar dropdown shadow | New conditional `shadow-lg` class is a known react-native-css-interop upgrade-warning crash trigger (misleading "Couldn't find a navigation context" error; nativewind/nativewind#1432) | Dropdown now uses inline shadow props (token-derived color, elevation 8) instead of the `shadow-lg` class |
| Language-switcher dialog container | `variant="dialog"` always rendered as a full-width bottom sheet, including on iPad where web shows a centered dialog | Header switcher renders `Dialog.Content` (centered `max-w-md`) at ≥768 and the bottom sheet only below 768; the picker itself stays `variant="dialog"` |

The "Couldn't find a navigation context" crash message is a known NativeWind
dev-mode artifact and is **not** caused by a missing `NavigationContainer`.
The NavBar fix above removes the most likely new trigger; the remaining
conditional `shadow-*`/alpha classes elsewhere in the app are tracked as a
follow-up (upgrade or patch `react-native-css-interop`).

### Bottom-sheet policy (2026-08-07)

Bottom sheets are now reserved for phones and narrow iPad windows
(width < `md`, 768px). On larger screens every sheet-style surface renders as
a centered dialog instead, matching `apps/web`. The language picker sizing bug
(its `flex-1` root collapsed to a sliver inside the centered `Dialog.Content`)
was fixed by making dialog mode size to content.

| Surface | < 768 | ≥ 768 |
|---|---|---|
| Language switcher (`variant="dialog"`) | bottom sheet | centered `Dialog.Content` (`max-w-md`) |
| Subtitle-search video list | bottom sheet | centered dialog (`max-w-lg`, capped height) |
| Dictionary popup | bottom sheet | centered dialog (`max-w-lg`, capped height) |
| WebView sheet | bottom sheet | centered dialog (`max-w-2xl`, capped height) |
| Context menu | bottom sheet | centered dialog (`max-w-sm`) |
| Right sidebar / hamburger drawer | drawer / sheet (nav only) | persistent sidebar / removed |

### Implemented source files (highlights)

- `apps/mobile/lib/constants.ts` — breakpoint constants + `gridColumnCount()`
- `apps/mobile/hooks/use-responsive.ts` — shared breakpoint hook
- `apps/mobile/components/layout/PageContainer.tsx` — `maxWidth` variants
- `apps/mobile/components/layout/NavBar.tsx` — md+ header navigation
- `apps/mobile/components/layout/AuthContainer.tsx` — centered auth form shell
- `apps/mobile/components/ui/sidebar.tsx` — 1024 sidebar breakpoint
- `apps/mobile/components/video/VideoGrid.tsx` — web column model + `flex: 1` card cells for multi-column rows
- `apps/mobile/components/reader/PaginatedReader.tsx` — lg side-by-side translation
- `apps/mobile/app/(tabs)/(media)/live-tv.tsx` — lg player/list columns
- `apps/mobile/app/(tabs)/(media)/local-media.tsx` — lg player/transcript columns + `max-w-7xl` content cap
- `apps/mobile/app/(tabs)/(me)/settings/index.tsx` — 1024 split + Display default
- `apps/mobile/components/layout/LanguageSwitcher.tsx` — centered dialog ≥768, bottom sheet below
- Bottom-sheet policy — `LanguageSwitcher`, `SubsSearchResults`, `WebViewSheet`, `DictionaryPopup`, `ui/context-menu`: bottom sheets <768, centered dialogs ≥768

---

## Route-by-route audit

Legend for web behavior: `default → sm → md → lg → xl` where a value changes.

### Media routes

| Route (web → mobile) | Web behavior | Mobile today | Required mobile change |
|---|---|---|---|
| Explore → `(media)/index` | `max-w-7xl`; grid 1 → 2 → 3 → 4 | `max-w-3xl`; grid 1 <400, 2 <700, 3 <1000, 4 ≥1000 | Use `max-w-7xl`; align grid thresholds to 640/1024/1280 |
| Search → `(media)/search` | No results `max-w-2xl`; results `max-w-7xl` + `VideoGrid` | `max-w-3xl`; results single-column list | Render results with `VideoGrid`; switch container width when results exist |
| Music → `(media)/music` | `max-w-7xl` + `VideoGrid` | `max-w-3xl`; single-column `FlatList` | Replace single-column list with `VideoGrid`; widen container |
| Live TV → `(media)/live-tv` | `max-w-7xl`; player + list stacked <lg; side-by-side `lg:w-80 xl:w-96` at ≥1024 | `max-w-3xl`; always stacked | Add ≥1024 two-column layout; widen container |
| TV Shows → `(media)/tv-shows` | `max-w-7xl`; grid 1 → 2 → 3 → 4 | `max-w-3xl`; `numColumns={2}` always | Use responsive `numColumns`; widen container |
| TV Show detail → `(media)/tv-shows/[id]` | `max-w-4xl` row list | Full-width row list | Cap at `max-w-4xl` |
| Channel → `(media)/channel/[channelId]` | `max-w-7xl` + `VideoGrid` | `max-w-3xl` + `VideoGrid` | Widen container; align grid thresholds |
| Watch → `(media)/watch/[videoId]` | Wide = aspect ratio >1; transcript `grid-cols-[1fr_320px]`; narrow stacked | Same aspect-ratio logic and 320px column | Minor: keep narrow subtitles within `max-w-7xl` padding |
| Local media → `(media)/local-media` | `max-w-7xl`; stacked <lg; `lg:grid-cols-[1fr_320px]` | Full-width; always stacked | ✅ Add ≥1024 player + transcript two-column layout and cap at `max-w-7xl` (review fix) |
| Watch history → `(media)/watch-history` | `max-w-4xl` flat list | `max-w-3xl` date-grouped list | Widen to `max-w-4xl`; decide whether date grouping stays (mobile-only layout improvement) |
| Liked videos → `(me)/liked-videos` | `max-w-4xl` row list | `max-w-3xl` row list | Widen to `max-w-4xl` |
| Playlists → `(me)/playlists` | `max-w-5xl`; cards 1 → 2 → 3 | `max-w-3xl`; single-column rows | Add responsive card grid; widen to `max-w-5xl` |
| Playlist detail → `(me)/playlists/[playlistId]` | `max-w-4xl` row list | `max-w-3xl` row list | Widen to `max-w-4xl` |

### Reading & vocabulary routes

| Route (web → mobile) | Web behavior | Mobile today | Required mobile change |
|---|---|---|---|
| Notes reader → `(reading)/index` | `max-w-7xl` full-height; sidebar sheet <lg, persistent ≥1024; translation side-by-side at lg | `max-w-3xl`; sidebar ≥768; translation stacked | Sidebar breakpoint → 1024; widen container; side-by-side translation at ≥1024 |
| Web reader → `(reading)/web-reader` | Same as notes reader + visited-sites sidebar | Same mobile pattern (`max-w-3xl`, sidebar ≥768) | Same changes as notes reader |
| EPUB reader → `(reading)/epub` | `max-w-7xl`; sidebar sheet <lg, persistent ≥1024; bookshelf 2 → 3 → 4 → 5 | Full-width; sidebar ≥768; bookshelf 2 <520, 3 <720, 4 ≥720 | Sidebar → 1024; bookshelf thresholds 640/768/1280 and 5 columns at xl |
| Dictionary search → `(vocab)/index` | `max-w-7xl` full-height shell with persistent search bar + word-list sidebar at lg | `max-w-3xl` standalone search page; no persistent shell | Add web-like full-height dictionary shell with persistent search and sidebar |
| Dictionary entry → `(vocab)/word/[entryId]` | Within `max-w-7xl` dictionary shell; definition/tabs stacked <lg, side-by-side ≥1024; sidebar at lg | Full-width; split at ≥768; sidebar ≥768 | Move split and sidebar to ≥1024; keep within dictionary shell width |
| Saved words → `(vocab)/saved-words` | `max-w-7xl`; grid 1 → 2 → 3 → 4 | `max-w-3xl`; grid 1 <640, 2 <900, 3 <1200, 4 ≥1200 | Widen to `max-w-7xl`; align thresholds to 640/1024/1280 |
| Review → `(vocab)/review` | `max-w-2xl`; card padding `p-4 sm:p-8` | `max-w-3xl`; card padding always `p-4` | Use `max-w-2xl`; increase card padding ≥640 |

### Settings, account & auth routes

| Route (web → mobile) | Web behavior | Mobile today | Required mobile change |
|---|---|---|---|
| Settings → `(me)/settings` | `max-w-5xl`; single list <lg; `lg:grid-cols-[220px_1fr]` at ≥1024; root redirects to Display; details `max-w-lg` | Split at ≥600 with `min(256, width*0.4)` sidebar; wide root shows placeholder; details full width | Move split to ≥1024; auto-select Display on wide root; align sidebar width and detail max width |
| Profile → `(me)/profile` | `max-w-3xl`; plan cards 1 → 3 at sm | `max-w-3xl`; plan rows stacked | Add responsive plan row grid (1 <640, 3 ≥640) |
| Go Pro → `(me)/go-pro` | `max-w-3xl`; plan cards 1 → 3 at sm | `max-w-3xl`; plan cards stacked | Add responsive plan grid (1 <640, 3 ≥640) |
| Docs → `(me)/docs` | List `max-w-2xl`; detail `max-w-3xl` + TOC sidebar; slide-in <xl, sticky ≥1280 | `max-w-3xl` single screen; inline "On this page" list, no persistent sidebar | Decide scope: route-per-doc + TOC sidebar parity, or keep single-screen docs as documented mobile deviation |
| Tokenizer → `(me)/tokenizer-test` | `max-w-2xl` | Full-width scroll view | Cap at `max-w-2xl` |
| Language select → `select-language` | Fullscreen; tabs <640, bi-panel ≥640 | Same 640 threshold | No change to the picker itself; header switcher dialog now centered ≥768 instead of a bottom sheet (review fix) |
| Login/Register/Forgot/Reset/Verify | Centered `max-w-md` card | Full-width form | Wrap auth forms in centered `max-w-md` container |
| Go Pro success/error | `max-w-lg` centered; buttons row at sm | Full-width centered; buttons stacked | Align width cap and button row at ≥640 |

### Route gaps

- `/` landing page is web-only; mobile redirects to login/explore.
- Web has `/docs/[...slug]` per-doc routes; mobile has one in-memory docs screen.
- Mobile-only: `(me)/about`, `(me)/offline-dictionaries`, `delete-account`, and the `(me)` menu home.

---

## Shared component gaps

| Component | Web | Mobile | Required change |
|---|---|---|---|
| `TextActionMenu` translation | Original + translation side-by-side at lg | Always stacked | Add `lg`-equivalent side-by-side mode at ≥1024 |
| `DictionaryPopup` | ~448px centered dialog | Bottom sheet | ✅ Centered dialog ≥768, bottom sheet below (bottom-sheet policy) |
| Subs-search list modal | Bottom sheet <640, centered ≥640 | Always bottom sheet | ✅ Centered dialog ≥768, bottom sheet below (bottom-sheet policy) |
| `ImageSearchResults` | 3 columns <640, 4 ≥640 | Always 3 columns | Use 4 columns ≥640 |
| Hamburger drawer | `w-64` | `min(256, width*0.6)` | Keep cap (it's better for split view); align when drawer is removed ≥md |

---

## Implementation plan

### Phase 1 — Responsive foundation ✅ Implemented

**Goal:** one shared breakpoint source and a page container that can express web's per-route max widths.

1. Add named constants to `apps/mobile/lib/constants.ts`:
   - `SM_BREAKPOINT = 640`
   - `MD_BREAKPOINT = 768`
   - `LG_BREAKPOINT = 1024`
   - `XL_BREAKPOINT = 1280`
2. Add a `useResponsive()` hook around `useWindowDimensions()` exposing `isSm`, `isMd`, `isLg`, `isXl`.
3. Replace magic thresholds in `Header`, `LanguagePicker`, `VideoGrid`, `SavedWordsScreen`, `EpubBookshelf`, `settings/*`, and `sidebar.tsx` with these constants.
4. Extend `PageContainer` with a `maxWidth` prop (or variant):
   - `2xl` → 672 (tokenizer)
   - `3xl` → 768 (default; profile, go-pro, docs)
   - `4xl` → 896 (watch history, liked, playlist detail, TV show detail)
   - `5xl` → 1024 (playlists)
   - `7xl` → 1280 (explore, search results, music, live TV, TV shows, channel, saved words, readers)
   - `full` for watch, local media, EPUB

**Acceptance:** every mobile route can express the same content width as its web counterpart; no hardcoded numeric width checks remain except in `useResponsive`.

### Phase 2 — Grid parity ✅ Implemented

1. Update `VideoGrid` columns to web's model:
   - `<640` → 1
   - `640–1023` → 2
   - `1024–1279` → 3
   - `≥1280` → 4
2. Update `music.tsx` to render `VideoGrid` instead of a single-column `FlatList`.
3. Update `search.tsx` results to render `VideoGrid` instead of `layout="list"` rows; switch container from `3xl` to `7xl` only when results exist.
4. Update `tv-shows.tsx` to derive `numColumns` from `useResponsive()` instead of hardcoded 2.
5. Update `saved-words.tsx` grid thresholds to 640/1024/1280.
6. Update `EpubBookshelf` columns to 2/3/4/5 at 640/768/1280.
7. Update `ImageSearchResults` to use 4 columns ≥640.

**Acceptance:** at 820px, media grids show the same column count as web at `md`; at 1180px, the same as web at `lg`; at ≥1280px, the same as web at `xl`.

### Phase 3 — Shell and navigation ✅ Implemented

1. In `Header.tsx`, render the hamburger drawer button only below `MD_BREAKPOINT` (768).
2. At ≥768, render persistent navigation matching web's `NAV_GROUPS`/`NAV_ICONS` — either ported `NavDropdown` components or a horizontal nav row with the same groups and destinations.
3. Make the app name always visible (remove the `<640` hiding rule).
4. Keep the drawer width cap (`min(256, width*0.6)`) for split view.

**Acceptance:** iPad full portrait and landscape show web-style persistent nav; phones show the current drawer.

### Phase 4 — Sidebar and split-layout parity ✅ Implemented

1. Change `SIDEBAR_BREAKPOINT` in `components/ui/sidebar.tsx` from 768 to `LG_BREAKPOINT` (1024).
2. Move dictionary entry definition/tabs split from ≥768 to ≥1024.
3. Align dictionary entry screen inside the web-like dictionary shell width (`max-w-7xl`) rather than full width.
4. Move settings split from ≥600 to ≥1024.
5. On wide settings root, auto-select Display (matching web's redirect to `/settings/display`).
6. Align settings sidebar width toward web's 220px (mobile may keep a 40% cap for split view).
7. Constrain settings detail panels to `max-w-lg`.

**Acceptance:** sidebars and split views appear at the same width thresholds as web; 768–1023 behaves like web's mobile sheet mode.

### Phase 5 — Side-by-side surfaces ✅ Implemented

1. Live TV: at ≥1024, render player + channel list side-by-side with the web widths (`320` at lg, `384` at xl).
2. Local Media: at ≥1024, render player/controls + transcript in `1fr 320px` columns.
3. Reader/web-reader/EPUB: at ≥1024, render original text and translation side-by-side through `TextActionMenu`/block rendering.
4. Review card: increase padding at ≥640.

**Acceptance:** 1180px iPad landscape shows the same side-by-side regions as web `lg`.

### Phase 6 — Remaining route widths ✅ Implemented

1. Wrap auth forms (login, register, forgot password, password reset, verify email, delete account) in a centered `max-w-md` container.
2. Cap tokenizer at `max-w-2xl`.
3. Widen watch history, liked videos, playlist detail, and TV show detail to their web widths.
4. Add responsive plan grids to Profile and Go Pro (1 → 3 at sm).
5. Docs: **decision — keep the single-screen mobile docs as a deliberate deviation** (no per-doc routes or TOC sidebar in this pass). Mobile docs remain a mobile-optimized search + reading surface; web docs keep the sidebar/TOC model.

**Acceptance:** every route's content cap matches its web counterpart at all widths.

### Phase 7 — Verification and documentation ⬜ Pending

1. Run `cd apps/mobile && ./node_modules/.bin/tsc --noEmit`.
2. Manual iPad matrix (see [Manual verification checklist](#manual-verification-checklist) below):
   - iPad 1/3 split (~320px): phone layout, 1-column grids, capped drawer, stack nav.
   - iPad 50/50 (~438px): phone layout where detail pane would be too small.
   - Full portrait (820px): persistent header nav, web `md` columns, `PageContainer` width parity.
   - Full landscape (1180px): web `lg` columns, side-by-side surfaces, persistent sidebars.
   - Windowed / Apple Silicon (>1200px): web `xl` columns and max widths.
3. Update the human iPad checklist in `docs/specs/023-mobile-e2e-testing.md` with the new breakpoint expectations.
4. Update this spec's status to `complete` once the checklist passes.

**Acceptance:** typecheck passes and the manual matrix shows no route that visibly diverges from web's layout at the same width.

---

## Manual verification checklist

Run on an iPhone (or iPad 1/3 split) and an iPad simulator. Expected width
buckets follow Tailwind: `<640`, `640–767`, `768–1023`, `1024–1279`, `≥1280`.

### Global shell

- [ ] Header: hamburger only below 768; persistent nav at ≥768; app name always visible; nav dropdowns open and navigate.
- [ ] Hamburger drawer: capped at `min(256, width*0.6)`; drawer never renders at ≥768.
- [ ] Auth screens: centered at `max-w-md` (448px) at every width.
- [ ] Language switcher dialog: bottom sheet below 768; centered `max-w-md` dialog at ≥768 (picker remains `variant="dialog"`).
- [ ] Dictionary popup, subtitle-search list, WebView sheet, and context menus: bottom sheet below 768; centered dialogs at ≥768 (no stretched full-width sheets on iPad).

### Media screens

- [ ] **Explore** — grid 1/2/3/4 at `<640 / 640–1023 / 1024–1279 / ≥1280`; cards tile in equal-width columns; content capped at 1280.
- [ ] **Search** — no-results state narrow; results use the same grid as Explore; result count shown.
- [ ] **Music** — uses the Explore grid, not a single-column list.
- [ ] **Live TV** — stacked below 1024; player left + channel list right at ≥1024 (320px at lg, 384px at xl).
- [ ] **TV Shows** — grid 1/2/3/4, no hardcoded 2 columns.
- [ ] **TV Show detail** — row list capped at 896.
- [ ] **Channel** — Explore-style grid; channel header card intact.
- [ ] **Watch** — portrait: subtitle band below player; landscape: subtitle overlay or right transcript column (320px).
- [ ] **Local Media** — with captions: stacked below 1024, player + 320px transcript at ≥1024; without captions: full-width player; content capped at 1280.
- [ ] **Watch History** — capped at 896; date grouping retained (documented mobile improvement).
- [ ] **Liked Videos** — capped at 896.
- [ ] **Playlists** — card grid 1/2/3 at `<640 / 640–1023 / ≥1024`; delete overlay on cards.
- [ ] **Playlist detail** — capped at 896.

### Reading & vocabulary screens

- [ ] **Notes Reader / Web Reader / EPUB** — sidebar is a slide-in sheet below 1024 and a persistent panel at ≥1024.
- [ ] **Reader translation** — translation beside the L2 block at ≥1024, stacked below 1024.
- [ ] **EPUB bookshelf** — 2/3/4/5 columns at `<640 / 640–767 / 768–1279 / ≥1280`.
- [ ] **Dictionary search** — capped at 1280; web's persistent search shell is intentionally not ported.
- [ ] **Dictionary entry** — definition/tabs split and sidebar appear at ≥1024; content capped at 1280.
- [ ] **Saved Words** — grid 1/2/3/4 at web thresholds; capped at 1280.
- [ ] **Review** — capped at 672; card padding 16 below 640 and 32 at ≥640.
- [ ] **Image search** — 3 columns below 640, 4 columns at ≥640.

### Settings, profile, and auth screens

- [ ] **Settings** — stack below 1024; split at ≥1024; Display auto-selected on wide root; sidebar ~220px; detail content capped at 512.
- [ ] **Profile / Go Pro** — plan cards 1 column below 640, 3 columns at ≥640.
- [ ] **Tokenizer** — capped at 672.
- [ ] **Login / Register / Forgot / Reset / Verify / Delete account** — centered 448px container.
- [ ] **Go Pro success / error** — centered 512px container; action buttons row at ≥640.
- [ ] **Docs** — single-screen mobile docs, no TOC sidebar (intentional deviation).

### Quick mode matrix

| Mode | Width | Expected |
|---|---|---|
| iPhone portrait | 320–430 | 1-column grids, drawer nav, stacked panels |
| iPad Slide Over / 1/3 split | ~320–438 | same as phone; drawer capped |
| iPad 50/50 split | ~438–680 | 1–2 columns; no persistent sidebars |
| iPad full portrait | 820 | 2-column grids, persistent header nav, sheet sidebars |
| iPad full landscape | 1180 | 3-column grids, persistent sidebars, side-by-side surfaces |
| Windowed / Apple Silicon | ≥1280 | 4-column grids, 5-column EPUB shelf, web max-widths |

---

## Dependencies

- Existing `PageContainer`, `VideoGrid`, shared `Sidebar`, and settings split code (all already present).
- No new backend or shared-package changes are expected.
- `TabbedPanel` already adapts by measured width; no change required.

---

## Risks

| Risk | Mitigation |
|---|---|
| Changing grid thresholds will change phone layouts too | Keep <640 identical to today; only align 640+ behavior |
| Persistent mobile header nav may feel cramped at 768–1023 | Reuse web's compact nav labels; keep drawer as fallback below 768 |
| Settings split at 1024 makes iPad 50/50 fall back to stack nav | That matches web; split only appears when there is room |
| `PageContainer` max-width changes could make iPad content look too wide | Web already uses these widths; verify with the manual matrix |
| Docs parity is large | Treat docs as its own sub-phase with an explicit open question |

---

## Open Questions

1. ~~Should mobile Music/Search use the exact same grid as Explore, or keep a denser list variant?~~ **Resolved (2026-08-07)** — they use the same responsive `VideoGrid` as Explore.
2. ~~Should watch-history date grouping stay as a mobile improvement?~~ **Resolved (2026-08-07)** — keep it; it's a documented mobile-only improvement.
3. ~~Should docs get full route-per-doc + TOC sidebar parity, or remain a single-screen mobile docs surface?~~ **Resolved (2026-08-07)** — keep the single-screen mobile docs surface; revisit only if docs become a primary mobile surface.
4. Should the dictionary entry screen get the full web shell (persistent search bar + sidebar)? **Open** — phases 1–6 stop at width/breakpoint/sidebar parity; the full shell is a possible follow-up.
5. ~~Should auth forms become centered `max-w-md` cards?~~ **Resolved (2026-08-07)** — yes, via `AuthContainer`.
