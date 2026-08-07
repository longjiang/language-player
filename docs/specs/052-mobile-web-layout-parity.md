# SPEC-052 — Mobile ↔ Web Layout Parity (iPad-First)

## Metadata

- **Spec ID**: SPEC-052
- **Feature**: Bring `apps/mobile` layout behavior in line with `apps/web` at every screen-size breakpoint
- **Status**: draft
- **Created**: 2026-08-07
- **ROADMAP Phase**: Phase 8 — iPad & Responsive Layout
- **Scope**: `apps/mobile` only; `apps/web` is the reference implementation
- **Related specs**: [SPEC-020 — iPad & Responsive Layout](020-ipad-responsive-layout.md) · [SPEC-049 — Web → Mobile Feature Parity](049-mobile-feature-parity.md) · [SPEC-050 — Mobile Sidebar & Video Layout Parity](050-mobile-sidebar-video-parity.md) · [SPEC-051 — Mobile Text-Scale Parity](051-mobile-text-scale-parity.md) · [ADR-0010 — Fresh Mobile Port](../adr/0010-port-web-to-mobile-fresh-start.md) · [ADR-0014 — Interaction Primitives Strategy](../adr/0014-rn-primitives-interaction-primitives.md) · [ADR-0015 — Settings UI and Search](../adr/0015-settings-ui-and-search.md)

---

## Overview

`apps/web` uses Tailwind breakpoints (`sm` 640, `md` 768, `lg` 1024, `xl` 1280) and a per-route max-width model to adapt every page from phone to desktop. `apps/mobile` has no CSS breakpoint system. It uses a handful of JS thresholds in individual components (`400`, `600`, `640`, `700`, `768`, `900`, `1000`, `1200`), a single `max-w-3xl` page container for most routes, and no persistent header navigation on any width.

This spec records the current route-by-route layout gap and defines a step-by-step plan to make mobile match web at each breakpoint, with iPad as the primary target.

The goal is **layout parity**, not identical code. Mobile still uses React Native primitives and NativeWind, but the visual structure — columns, sidebars, max widths, side-by-side regions, and breakpoints — should match web.

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
| Local media → `(media)/local-media` | `max-w-7xl`; stacked <lg; `lg:grid-cols-[1fr_320px]` | Full-width; always stacked | Add ≥1024 player + transcript two-column layout |
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
| Language select → `select-language` | Fullscreen; tabs <640, bi-panel ≥640 | Same 640 threshold | No change |
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
| `DictionaryPopup` | ~448px centered dialog | Bottom sheet | Leave as platform-appropriate or align sizing on iPad (open question) |
| Subs-search list modal | Bottom sheet <640, centered ≥640 | Always bottom sheet | Optionally center on ≥640 |
| `ImageSearchResults` | 3 columns <640, 4 ≥640 | Always 3 columns | Use 4 columns ≥640 |
| Hamburger drawer | `w-64` | `min(256, width*0.6)` | Keep cap (it's better for split view); align when drawer is removed ≥md |

---

## Implementation plan

### Phase 1 — Responsive foundation

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

### Phase 2 — Grid parity

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

### Phase 3 — Shell and navigation

1. In `Header.tsx`, render the hamburger drawer button only below `MD_BREAKPOINT` (768).
2. At ≥768, render persistent navigation matching web's `NAV_GROUPS`/`NAV_ICONS` — either ported `NavDropdown` components or a horizontal nav row with the same groups and destinations.
3. Make the app name always visible (remove the `<640` hiding rule).
4. Keep the drawer width cap (`min(256, width*0.6)`) for split view.

**Acceptance:** iPad full portrait and landscape show web-style persistent nav; phones show the current drawer.

### Phase 4 — Sidebar and split-layout parity

1. Change `SIDEBAR_BREAKPOINT` in `components/ui/sidebar.tsx` from 768 to `LG_BREAKPOINT` (1024).
2. Move dictionary entry definition/tabs split from ≥768 to ≥1024.
3. Align dictionary entry screen inside the web-like dictionary shell width (`max-w-7xl`) rather than full width.
4. Move settings split from ≥600 to ≥1024.
5. On wide settings root, auto-select Display (matching web's redirect to `/settings/display`).
6. Align settings sidebar width toward web's 220px (mobile may keep a 40% cap for split view).
7. Constrain settings detail panels to `max-w-lg`.

**Acceptance:** sidebars and split views appear at the same width thresholds as web; 768–1023 behaves like web's mobile sheet mode.

### Phase 5 — Side-by-side surfaces

1. Live TV: at ≥1024, render player + channel list side-by-side with the web widths (`320` at lg, `384` at xl).
2. Local Media: at ≥1024, render player/controls + transcript in `1fr 320px` columns.
3. Reader/web-reader/EPUB: at ≥1024, render original text and translation side-by-side through `TextActionMenu`/block rendering.
4. Review card: increase padding at ≥640.

**Acceptance:** 1180px iPad landscape shows the same side-by-side regions as web `lg`.

### Phase 6 — Remaining route widths

1. Wrap auth forms (login, register, forgot password, password reset, verify email, delete account) in a centered `max-w-md` container.
2. Cap tokenizer at `max-w-2xl`.
3. Widen watch history, liked videos, playlist detail, and TV show detail to their web widths.
4. Add responsive plan grids to Profile and Go Pro (1 → 3 at sm).
5. Docs: either port per-doc routes + TOC sidebar (slide-in <1280, sticky ≥1280) or document the single-screen mobile docs as a deliberate deviation.

**Acceptance:** every route's content cap matches its web counterpart at all widths.

### Phase 7 — Verification and documentation

1. Run `cd apps/mobile && ./node_modules/.bin/tsc --noEmit`.
2. Manual iPad matrix:
   - iPad 1/3 split (~320px): phone layout, 1-column grids, capped drawer, stack nav.
   - iPad 50/50 (~438px): phone layout where detail pane would be too small.
   - Full portrait (820px): persistent header nav, web `md` columns, `PageContainer` width parity.
   - Full landscape (1180px): web `lg` columns, side-by-side surfaces, persistent sidebars.
   - Windowed / Apple Silicon (>1200px): web `xl` columns and max widths.
3. Update the human iPad checklist in `docs/specs/023-mobile-e2e-testing.md` with the new breakpoint expectations.
4. Update this spec's status to `complete` once the checklist passes.

**Acceptance:** typecheck passes and the manual matrix shows no route that visibly diverges from web's layout at the same width.

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

1. Should mobile Music/Search use the exact same grid as Explore, or keep a denser list variant on phones and only grid on ≥640?
2. Should watch-history date grouping stay as a mobile improvement, or be removed to match web's flat list?
3. Should docs get full route-per-doc + TOC sidebar parity, or remain a single-screen mobile docs surface?
4. Should the dictionary entry screen get the full web shell (persistent search bar + sidebar), or is the current split screen close enough once widths/breakpoints align?
5. Should auth forms become centered `max-w-md` cards, or is full-width mobile auth intentional on iPad?
