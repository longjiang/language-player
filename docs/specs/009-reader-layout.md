# SPEC-009: Reader Layout System

## Metadata
- **Spec ID**: SPEC-009
- **Feature**: Shared reader layout with responsive sidebar
- **Status**: in-progress
- **Created**: 2026-07-23
- **ROADMAP Phase**: Phase 4 (Reading)
- **See also**: [Shared i18n pipeline](../arch/009-shared-i18n-pipeline.md)

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
- Notes imported this session show an **"Imported" badge** (see §"Notes Reader Default Screen")
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

## Notes Reader Default Screen

When **no note is open**, the Notes Reader shows a default screen instead of
the editor/reader and its Edit/Read tabs (the tabs only exist for an open
note). Both apps implement it — web `apps/web/src/app/[l1]/[l2]/reader/page.tsx`,
mobile `apps/mobile/app/(tabs)/(reading)/index.tsx`:

- **Title bar** reads "Notes Reader"
- A **dotted (dashed) drag-and-drop area** — visually matching the Image
  Reader's drop zone — with a message explaining what the Notes Reader is and
  that text files can be dragged/pasted in to import them
- **Buttons:**
  - **New Note** — creates an empty note and opens it (editor mode)
  - **Browse** — opens the OS file picker, **multi-select**; each text file
    (`.txt`/`.md`) is imported as its own note titled with the file name
    (extension included). After importing: the **last** imported note opens,
    and if **more than one** was imported the side panel also opens. Imported
    notes carry an **"Imported" badge** in the notes list for the rest of the
    session (cleared on reload/restart — session-only, no data-model change).
  - **Paste** — creates a new note with the clipboard text; **Ctrl/Cmd-V**
    (web) does the same while no note is open
  - **List All Notes** — opens the notes side panel (persistent panel on wide
    screens, slide-in sheet on narrow). **Mobile** puts this button in its own
    right-aligned row **above** the dotted drop area — the usual
    sidebar-toggle position, matching the note-open screen's toggle — spaced
    off the app header (`pt-4 pb-2`); **web** keeps it inline in the drop
    zone's button row.

### Auto-restore vs. nav re-entry (web)

- **Auto-restore**: a fresh visit to the reader reopens the last-open note
  (`lp_reader_last_note` in localStorage) — parity with the mobile reader's
  saved-active-note restore.
- **Nav re-entry**: tapping Nav → Notes Reader while a note is **already open**
  (the URL loses its `?noteId` param) closes the note and lands on the default
  screen — mirroring the EPUB reader's same-route Rule A close.

## Notes Reader: the Edit and Read Tabs

An **open note** has two tabs (the tabs exist only for an open note — see the
default screen above):

- **Edit** — a plain textarea for the note's text, with **Add Sample Text** and
  **Tokenize** below it. Notes autosave while typing.
- **Read** — the paginated, tokenized reader with translation (SPEC-087).

The tab moves **only on an explicit user action**:

| Action | Result |
|---|---|
| Tap/click **Edit** | Shows the textarea |
| Tap/click **Read**, or **Tokenize** | Shows the paginated reader |
| **New Note**, or opening an empty note | Opens on **Edit** |
| Selecting a note that has text | Opens on **Read** |
| Import / paste that opens a note | Follows the two rules above |

**Editing text never switches tabs.** Autosaving, note sync, or a server
refresh may replace the open note's body underneath the editor, but that must
not move the tab — the user leaves the editor only by tapping **Read** or
**Tokenize**. (Web's reader page sets its `activeTab` only in explicit
handlers: select note → read, new note → edit, Tokenize → read. Mobile tracks
its open editor session by note id + the body it was loaded with, and adopts
an incoming body only while the text is untouched —
`apps/mobile/app/(tabs)/(reading)/index.tsx`.)

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
| Click "Tokenize" (or the Read tab) | Switches to the read tab — the only way in |
| Edit a note's text | Stays on the current tab (an autosave never switches tabs) |
| Rename a note | Inline title editing via pencil icon (saved notes only) |
| Close EPUB | Returns to upload screen |
| Press arrow keys | Navigate pages in the reader |
| Toggle translation checkbox | Show/hide translated text blocks |

## Revision (2026-09-11) — Explicit Edit/Read switching, mobile List All Notes row

Two behaviors that were never written down are now specified above:

- **The Edit/Read tabs switch only on an explicit action** (§"Notes Reader: the
  Edit and Read Tabs" + the Interaction Summary rows). Mobile previously
  re-derived the tab from the current-note object, so the 2-second autosave
  flipped the user into Read mode mid-editing; web never had that behavior.
- **Mobile's "List All Notes" button** lives in its own right-aligned row above
  the dotted drop area, spaced off the app header — recorded in §"Notes Reader
  Default Screen" (shipped in `e568d7dd` without a spec update).
