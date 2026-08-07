# SPEC-050 — Mobile Sidebar & Video Layout Parity with Web

## Metadata

- **Spec ID**: SPEC-050
- **Feature**: Bring `apps/mobile` sidebar and video-panel implementations into parity with the shared `apps/web` sidebar model
- **Status**: complete
- **Created**: 2026-08-07
- **ROADMAP Phase**: Phase 6 (Interaction Primitives) / Phase 8 (iPad & Responsive Layout)
- **Scope**: `apps/mobile` only
- **Related specs**: [SPEC-049 — Web → Mobile Feature Parity](049-mobile-feature-parity.md) · [SPEC-020 — iPad & Responsive Layout](020-ipad-responsive-layout.md) · [ADR-0014 — Interaction Primitives Strategy](../adr/0014-rn-primitives-interaction-primitives.md)

---

## Overview

`apps/web` has a single shared `Sidebar` primitive
(`apps/web/src/components/ui/sidebar.tsx`) used by the dictionary, notes
reader, web reader, and EPUB reader. It provides the same panel chrome
(title, header actions, scrollable body, footer, mobile close button), the
same desktop persistent-panel behavior, and the same mobile slide-in sheet
behavior.

`apps/mobile` does not have an equivalent. The dictionary uses a direct
`Dialog.DrawerContent` wrapper, the notes reader and web reader duplicate an
inline overlay sidebar in two screens, and the EPUB sidebar is a custom
overlay component. The video player also diverges from web on wide screens:
web shows a fixed right-hand transcript/queue column, while mobile always
stacks the tabbed panel below the player.

This spec defines the steps to close that gap. The hamburger drawer and
settings sidebar are explicitly **out of scope**; `apps/mobile/STATUS.md` has
been removed and is also out of scope.

> Note: SPEC-049 §1.6 marked the shared sidebar primitive as "Ported (mobile
> equivalent)". That is true at the primitive level — this spec closes the
> remaining consumer-level consistency gap.

---

## Scope

### In scope

1. A shared mobile `Sidebar`/`SidebarPanel` component.
2. Video player wide-screen layout + `TranscriptQueuePanel` API parity.
3. Dictionary `WordListSidebar` migration onto the shared component.
4. Notes sidebar extraction + reader/web-reader migration.
5. EPUB sidebar migration onto the shared component.
6. Verification (typecheck + manual QA).

### Out of scope

- `HamburgerDrawer` — leave the current RN `Modal` implementation as-is.
- Settings sidebar — leave the current wide-screen left column as-is.
- `apps/mobile/STATUS.md` — deleted; do not recreate or update it.
- Optional cleanup of stale `STATUS.md` references in `docs/specs/015`,
  `016`, `020`, `021`, and `023` (separate housekeeping task).

---

## Current state

| Surface | Web implementation | Mobile implementation | Gap |
|---|---|---|---|
| Shared primitive | `components/ui/sidebar.tsx` (`Sidebar` + `SidebarPanel`) | `components/ui/dialog.tsx` `DrawerContent`, used only by dictionary | No mobile `Sidebar`/`SidebarPanel` wrapper |
| Dictionary | `components/dictionary/word-list-sidebar.tsx` → shared `Sidebar` | `components/dictionary/WordListSidebar.tsx` → direct `Dialog.Root`/`Portal`/`DrawerContent` | Mechanical migration |
| Notes reader | `components/reader/notes-sidebar.tsx` body inside shared `Sidebar` | Inline overlay in `app/(tabs)/(reading)/index.tsx` | Extract body; use shared `Sidebar` |
| Web reader | Visited-sites body inside shared `Sidebar` | Inline notes overlay in `app/(tabs)/(reading)/web-reader.tsx` | Extract body; decide notes vs visited-sites |
| EPUB | TOC body + tabs inside shared `Sidebar` | Custom `epub-chapter-sidebar.tsx` inside manual overlay | Make content-only; wrap in shared `Sidebar` |
| Video | Wide: `grid-cols-[1fr_320px]` + `TranscriptQueuePanel`; narrow: tabs below | Always stacked `TranscriptQueuePanel` with a mobile-only “Video” tab | Wide side-by-side layout + panel API parity |

---

## Implementation plan

### Step 1 — Build the shared mobile `Sidebar`

Create `apps/mobile/components/ui/sidebar.tsx`:

- `SidebarPanel` — header (title + optional actions + close), scrollable body,
  optional `emptyState`, optional pinned footer. Mirrors web’s
  `SidebarPanel` API.
- `Sidebar` — props `open`, `onOpenChange`, `sidebarOpen`, `desktopClassName`,
  plus the `SidebarPanel` props.
  - Narrow screens: render through `Dialog.Root` + `Dialog.Portal` +
    `Dialog.DrawerContent` (reusing `apps/mobile/components/ui/dialog.tsx`)
    so open/close, backdrop, and slide animation are shared.
  - Wide screens: render a persistent right panel, matching web’s desktop
    behavior.
- Width: `min(320, screenWidth * 0.85)` for the sheet; `w-64`-style width
  for the persistent panel.
- Decide the wide/narrow breakpoint (recommend a width-based constant rather
  than reusing the 640px `SM_BREAKPOINT`; see Open Questions).

### Step 2 — Align the video player with web (required)

Update `apps/mobile/components/video/TranscriptQueuePanel.tsx` to match web’s
API ([web `transcript-queue-panel.tsx`](../../apps/web/src/components/video/transcript-queue-panel.tsx)):

- Tabs: `transcript`, `queue`, and optional `info` (info only on narrow).
- Remove the mobile-only `video` tab.
- Use controlled tabs (`activeTab` + `onTabChange`) like web, or document why
  uncontrolled is acceptable.
- Support `className`/`contentRef` where needed for scroll behavior.

Update `apps/mobile/app/(tabs)/(media)/watch/[videoId].tsx`:

- Keep subtitles mode as-is.
- Transcript mode + wide/landscape: player + control bar + video info on the
  left, `TranscriptQueuePanel` in a fixed ~320px right column.
- Transcript mode + narrow/portrait: keep the current stacked tabbed layout,
  with `info` passed so it appears as a tab (matches web).

### Step 3 — Migrate the dictionary sidebar

Update `apps/mobile/components/dictionary/WordListSidebar.tsx`:

- Replace direct `Dialog.Root`/`Portal`/`DrawerContent` usage with the shared
  `Sidebar`.
- Pass the dynamic title and prev/next buttons via `headerActions`.
- Keep `isSidebarAvailable`, lazy entry fetching, active highlight, and
  `onNavigate` semantics.

### Step 4 — Extract and unify the notes sidebar

Create `apps/mobile/components/reader/NotesSidebar.tsx` mirroring web’s
`NotesSidebar` (content only — no overlay chrome):

- Props: notes, loading, error, current note id, and
  create/select/rename/delete callbacks.
- Match web semantics: selecting or creating a note closes the drawer.
- Keep mobile-specific sync-status icons where useful.

Refactor `apps/mobile/app/(tabs)/(reading)/index.tsx` and
`apps/mobile/app/(tabs)/(reading)/web-reader.tsx`:

- Replace both inline overlay `View`s with the shared `Sidebar`.
- Toggle icon: `PanelRightOpen` when closed, `PanelRightClose` when open,
  with accessibility labels.
- Web-reader content decision: match web’s visited-sites sidebar, or keep the
  notes sidebar as a documented intentional deviation (see Open Questions).

### Step 5 — Refactor the EPUB sidebar

Update `apps/mobile/components/reader/epub-chapter-sidebar.tsx`:

- Remove the header, close button, and prev/next controls so it only renders
  the TOC tree, matching web’s content-only component.

Update `apps/mobile/app/(tabs)/(reading)/epub.tsx`:

- Replace the manual overlay with the shared `Sidebar`.
- Pass `title` (`title.epub_reader`), prev/next `headerActions`, and the
  chapter-count `footer`.
- Decide whether to move `BookSearchDialog` into chapters/search tabs inside
  the sidebar (web parity) or keep it as a separate dialog (see Open
  Questions).

### Step 6 — Verification

- Run `cd apps/mobile && ./node_modules/.bin/tsc --noEmit`.
- Manually verify:
  - Video player in portrait and landscape (right column on wide, tabs on
    narrow, no “Video” tab).
  - Dictionary search → entry → sidebar (prev/next, highlight, close).
  - Notes reader and web reader sidebars (open/close, backdrop, animation,
    rename/delete).
  - EPUB sidebar (TOC, prev/next, close, search if integrated).
  - iPad split view / landscape (sheet vs persistent panel).
- Do not run production builds (`npx turbo build`, `npm run build`, etc.).

---

## Acceptance criteria

- Dictionary, notes reader, web reader, and EPUB all render through the same
  mobile `Sidebar` component with shared open/close, animation, backdrop,
  width, and panel chrome.
- No duplicated notes-sidebar markup remains in the two reader screens.
- Video player on wide screens matches web’s right-column transcript/queue
  layout; narrow screens keep the stacked tabbed layout without the
  mobile-only `Video` tab.
- `HamburgerDrawer` and settings are untouched.
- Mobile TypeScript check passes.

---

## Resolved during implementation

- **Web-reader sidebar content**: mobile now matches web — the web-reader
  sidebar shows visited sites (`VisitedSitesSidebar`), and the notes sidebar
  lives only in the notes reader.
- **EPUB search**: `BookSearchDialog` was replaced by `EpubSearchPanel`,
  rendered as a “Search” tab inside the shared sidebar alongside “Chapters”
  (web parity). The old full-screen dialog was removed.
- **Wide/narrow breakpoint**: `SIDEBAR_BREAKPOINT = 768` (`useWindowDimensions`
  width) switches between the persistent panel and the slide-in sheet.
- **Persistent panel on mobile**: wide screens get a true persistent,
  collapsible right panel (web parity); narrow screens use the shared sheet.

---

## Dependencies

- Existing `apps/mobile/components/ui/dialog.tsx` `DrawerContent`.
- Existing web reference implementations listed above.
- No new backend or shared-package work expected.
