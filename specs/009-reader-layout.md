# SPEC-009: Reader Layout System

## Metadata
- **Spec ID**: SPEC-009
- **Feature**: Shared reader layout with responsive sidebar
- **Status**: in-progress
- **Created**: 2026-07-23
- **ROADMAP Phase**: Phase 4 (Reading)
- **See also**: ADR-0014 (i18n pipeline)

## Overview

Three reader pages — Notes Reader, EPUB Reader, and Web Reader — share an identical layout shell. Each has a title bar, a content area, and an optional sidebar panel. The layout adapts to screen width: on wide screens the sidebar sits beside the content; on narrow screens it becomes a full-width overlay.

## Applies To

| Page | Route | Sidebar content |
|---|---|---|
| Notes Reader | `/[l1]/[l2]/reader` | Saved notes list |
| EPUB Reader | `/[l1]/[l2]/epub` | Chapter table of contents |
| Web Reader | `/[l1]/[l2]/web-reader` | Placeholder (future) |

## Layout Zones

Every reader page has three vertical zones stacked top to bottom:

```
┌─────────────────────────────────────────┐
│  1. Title bar                           │ ← always visible, fixed height
├─────────────────────────────────────────┤
│                                          │
│  2. Content + sidebar (side by side)    │ ← fills remaining height
│                                          │
└─────────────────────────────────────────┘
```

### Zone 1: Title Bar

- **Always visible**, even when the sidebar overlay is open
- Left side: icon + page title (editable for saved notes)
- Right side: sidebar toggle button + optional actions (close, etc.)
- The sidebar toggle button MUST be reachable at all times — it is the only way to dismiss the sidebar overlay on narrow screens
- Does not show a language pair subtitle (removed as redundant)

### Zone 2: Content Area + Sidebar

Two sub-zones arranged horizontally:

| Sub-zone | Purpose |
|---|---|
| Content area | The reader panel — paginated tokenized text, page navigation, translation toggle |
| Sidebar | Page-specific controls (notes list, chapter TOC, future web reader tools) |

## Wireframes

### Wide Screen — Sidebar Open

```
┌──────────────────────────────────────────────────────────────────┐
│  [Site Header: Logo, nav, search, language, user]              │
├──────────────────────────────────────────────────────────────────┤
│  📖 Notes Reader                              [◼ ⨄ ◼]           │ ← title bar
├──────────────────────────────────────────────┬───────────────────┤
│                                               │  Notes            │
│                                               │                   │
│  Chapter content with tokenized text.         │  [+ New Note]     │
│  Each word is interactive — tap to see        │                   │
│  dictionary definitions.                      │  📄 Chapter 1     │
│                                               │  📄 My notes      │
│  Lorem ipsum dolor sit amet, consectetur      │  📄 Vocab list    │
│  adipiscing elit. Sed do eiusmod tempor       │  📄 Grammar       │
│  incididunt ut labore et dolore magna         │                   │
│  aliqua.                                      │                   │
│                                               │                   │
│  ← 1 / 4 →    |    [🔤 Translation]          │                   │
└──────────────────────────────────────────────┴───────────────────┘
```

### Wide Screen — Sidebar Closed

```
┌──────────────────────────────────────────────────────────────────┐
│  [Site Header: Logo, nav, search, language, user]              │
├──────────────────────────────────────────────────────────────────┤
│  📖 Notes Reader                              [◼ ⨄ ◼]           │ ← toggle shows "expand"
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Chapter content with tokenized text.                             │
│  Each word is interactive — tap to see                            │
│  dictionary definitions.                                          │
│                                                                   │
│  Lorem ipsum dolor sit amet, consectetur                          │
│  adipiscing elit. Sed do eiusmod tempor                           │
│  incididunt ut labore et dolore magna                             │
│  aliqua.                                                          │
│                                                                   │
│  ← 1 / 4 →    |    [🔤 Translation]                              │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### Narrow Screen — Sidebar Closed (default)

```
┌──────────────────────────────────────┐
│  [Site Header: Logo, ☰, 🔍, 🌐, 👤] │ ← sticky, always visible
├──────────────────────────────────────┤
│  📖 Notes Reader         [◼ ⨄ ◼]    │ ← title bar
├──────────────────────────────────────┤
│                                       │
│  Chapter content...                   │
│  Lorem ipsum dolor sit amet.          │
│                                       │
│  ← 1 / 4 →  |  [🔤 Translation]     │
│                                       │
└──────────────────────────────────────┘
```

### Narrow Screen — Sidebar Open

```
┌──────────────────────────────────────┐
│  [Site Header: Logo, ☰, 🔍, 🌐, 👤] │ ← sticky z-50 (on top)
├──────────────────────────────────────┤
│  📖 Notes Reader         [◼ ⨄ ◼]    │ ← title bar z-50 (on top)
├──────────────────────────────────────┤
│ ┌──────────────────────────────────┐ │
│ │  Notes                           │ │ ← sidebar panel
│ │                                  │ │   (full width overlay)
│ │  [+ New Note]                    │ │
│ │                                  │ │
│ │  📄 Chapter 1                    │ │
│ │  📄 My notes                     │ │
│ │  📄 Vocab list                   │ │
│ │  📄 Grammar                      │ │
│ │                                  │ │
│ └──────────────────────────────────┘ │
│   ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │ ← dimmed backdrop
│   ░░ (content dimmed behind)     ░░  │
│   ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
└──────────────────────────────────────┘
```

### Narrow Screen — EPUB Reader (no EPUB loaded)

```
┌──────────────────────────────────────┐
│  [Site Header: Logo, ☰, 🔍, 🌐, 👤] │
├──────────────────────────────────────┤
│  📖 EPUB Reader                      │ ← no toggle (no EPUB loaded)
├──────────────────────────────────────┤
│                                       │
│        ┌─────────────────┐            │
│        │   ⬆ Upload icon  │            │
│        │                  │            │
│        │  Drop .epub here │            │
│        │  or click Browse │            │
│        │                  │            │
│        │  [Browse button] │            │
│        └─────────────────┘            │
│                                       │
└──────────────────────────────────────┘
```

## Wide Screen Behavior

On screens wide enough to show both panels side by side:

- The content area fills the available space
- The sidebar sits to the right at a fixed width
- Both panels are visible simultaneously
- The sidebar toggle button hides or shows the sidebar panel
- When hidden, the content area expands to use the freed space

## Narrow Screen Behavior

On screens too narrow for side-by-side layout:

- The sidebar is **closed by default** (no EPUB loaded = nothing to show)
- The content area fills the full width
- When the user opens the sidebar, it appears as a full-width section above the content:
  - The site header bar at the very top of the page remains visible
  - The reader's title bar (with the toggle button) remains visible above the sidebar
  - The sidebar panel fills the full width
  - The content area is pushed down below the sidebar
- The sidebar is still scrollable if its content exceeds the available height
- Tapping the toggle button again dismisses the sidebar and returns content to its full position

### Sidebar Toggle Button

- Always present in the title bar (when applicable: EPUB has chapters loaded, Notes has a note open)
- Icon changes to indicate current state (open vs closed)
- Toggles the sidebar between visible and hidden on all screen sizes

## Sidebar Content Per Reader

### Notes Reader Sidebar

- Header row: "Notes" title
- "New Note" button
- Scrollable list of saved notes
- Each note shows its title (or "Untitled") and creation date
- The currently selected note is highlighted
- Each note has a "more" menu (rename, delete)
- When not logged in, shows a prompt to log in

### EPUB Reader Sidebar

- Chapter navigation: Previous / Next buttons
- Scrollable table of contents with indented hierarchy
- Current chapter is highlighted
- Footer shows total chapter count

### Web Reader Sidebar

- Placeholder shell with a "Notes" header
- Content to be added in a future iteration

## Edge Cases

- **No EPUB loaded**: Sidebar toggle hidden, upload zone shown in content area
- **EPUB parse failure**: Error message shown in content area with a close button to reset
- **Non-EPUB file dropped**: Inline error message below the upload zone
- **Offline/unreadable file**: Inline error message (e.g., Dropbox placeholder)
- **Empty notes list**: "No notes yet" message when logged in; login prompt when not
- **Notes loading error**: Inline error message in the sidebar
- **No URL loaded (web reader)**: Empty state with instructions

## Component Tree

```
ReaderPage
├── TitleBar
│   ├── Icon
│   ├── Title (editable for notes)
│   └── SidebarToggle
└── ContentRow
    ├── ReaderSidebar
    │   └── (NotesSidebar | EpubChapterSidebar | placeholder)
    └── ContentArea
        └── ReaderPanel
            ├── PaginatedText
            ├── PageNavigation
            └── TranslationToggle
```

## Interaction Summary

| Action | Result |
|---|---|
| Click sidebar toggle | Opens or closes the sidebar panel |
| Select a note in sidebar | Loads that note in the reader |
| Select a chapter in sidebar | Loads that chapter in the reader |
| Click "New Note" | Creates a blank note, switches to edit tab |
| Rename a note | Inline title editing via pencil icon (saved notes only) |
| Close EPUB | Returns to upload screen |
| Press arrow keys | Navigate pages in the reader |
| Toggle translation checkbox | Show/hide translated text blocks |
