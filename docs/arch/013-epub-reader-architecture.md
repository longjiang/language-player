# EPUB Reader Architecture

## Metadata

- **Arch ID**: ARCH-013
- **Feature**: EPUB reader — parsing, pagination, ruby, progress sync (web + mobile)
- **Type**: as-built
- **Status**: accepted
- **Created**: 2026-07-25
- **Last Updated**: 2026-10-18
- **ROADMAP Phase**: Phase 5 — Content Features
- **Scope**: Next.js Web (`apps/web`), React Native Mobile (`apps/mobile`)
- **See also:** [Next.js Dictionary Architecture](./007-nextjs-dictionary-architecture.md), [Settings Architecture](./011-settings-architecture.md)
- **Source:** `apps/web/src/hooks/use-epub.ts`, `apps/mobile/hooks/use-epub.ts`, `apps/mobile/lib/epub-parser.ts`

---

## Overview

The EPUB Reader lets users upload `.epub` ebooks, navigate their table of contents, and read chapters with interactive word lookup (lemmatization + dictionary popup) and optional translation — the same language-learning features available for video subtitles and web articles. Both web and mobile share identical UX and a common book model (spine flow + TOC bookmarks + block locations), differing only in the I/O layer: web layers the whole-book model on `epubjs` (SPEC-032, ADR-0022); mobile uses JSZip + a hand-rolled XML parser (ADR-0012).

> **SPEC-032 (2026-08-02)** — The web reader was re-engineered from "chapter at a time" to the whole-book model: TOC entries are bookmarks into the spine flow, every navigation/search/restore action resolves to a `BookLocation { spineIndex, blockIndex, offset }`, and pagination is continuous across the entire book. The spine-range concatenation algorithm below is **obsolete on web** (kept for historical context; mobile still uses it).

Every book the user opens gets its own persistent handle on web (an IndexedDB record keyed by a SHA-256 hash of the file), so returning to the reader shows a **bookshelf** of covers sorted by last read, each with a percentage-completed indicator derived from character counts. Opening a book resumes at its saved chapter and page instead of reopening the same book automatically. Mobile has the same per-book bookshelf (`epub_library/` files + AsyncStorage `lp_epub_library_v1`, migrated once from the legacy single-book `epub_state.json`), but no metadata mirror: its books are sandbox files, not IndexedDB blobs.

---

## Wireframes

### Web Layout (wide screen, ≥1024px)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  filename.epub                                          [✕]            [☰]  │
├──────────────────────────────────────────────────────────┬───────────────────┤
│                                                          │  ◀  ▶  ◀◀        │
│  ⏳ Making words interactive...                          │                   │
│                                                          │  Ch 1: Intro      │
│  This is the first paragraph of the chapter. Every       │  Ch 2: Getting    │
│  word is tappable to see its dictionary definition,      │    Started  ◀──── │
│  pronunciation, and example sentences in context.        │    └ 2.1 Install  │
│                                                          │    └ 2.2 Config   │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─   │  Ch 3: Advanced   │
│  Este es el primer párrafo del capítulo. Cada palabra    │  Ch 4: Reference  │
│  se puede tocar para ver su definición del diccionario.  │  ...              │
│                                                          │                   │
│  Another paragraph follows after the translation block.  │                   │
│  Translation is toggled via the switch in the bottom     │                   │
│  bar beside the page counter.                            │                   │
│                                                          │                   │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─   │                   │
│  Otro párrafo sigue después del bloque de traducción.    │                   │
│                                                          │                   │
│               ◀  3 / 12  ▶  │  Translation [====●]       │  12 chapters      │
└──────────────────────────────────────────────────────────┴───────────────────┘
```

On screens narrower than 1024px, the sidebar collapses to a top bar that expands on tap.

**Close via the nav menu (web + mobile):** when a book is already open in the reader, selecting `Reading → ePub Reader` from the nav menu closes it and returns to the bookshelf — an alternative to the reader's own close button and the escape hatch when the reader's chrome is hidden. The reader screen registers its close handler on the `ReaderChrome` context (`registerCloseReader`); the Header / nav drawer / NavBar call `requestCloseReader` instead of a no-op same-route navigation when the epub nav item is tapped while already on the epub screen. Nested immersive-overlay readers inherit the registered handler so the reader's overlay chrome can close it too.

**Navigation rules (mobile) — two intentionally-different behaviors that must coexist:**

- **Cross-nav keep-open (Rule B):** if a book is open and the user navigates away
  from the epub screen (e.g. to another tab) and returns, the book stays open at
  its reading position. When the screen stays mounted (tab switch) the open
  `EpubBookModel` is simply kept; on a fresh mount the screen auto-opens the
  last-read book (the auto-open effect) so returning "resumes".
- **Same-route close (Rule A):** tapping the nav `Reading → ePub Reader` while
  **already on** the epub screen closes the open book and returns to the
  bookshelf (`requestCloseReader` → the registered close handler). This is a
  deliberate escape hatch, distinct from cross-nav.
- **Explicit close latches (Rule B amendment, 2026-08-31):** a book closed via
  the reader's close button (`epub.close()`) latches the reader shut for the
  active L2 — `lp_epub_reader_closed_v1` in AsyncStorage via
  `setReaderClosed()`/`isReaderClosed()` (`lib/epub-store.ts`). The latch
  survives tab navigation AND app relaunch: the auto-open effect skips while
  `readerClosed` is true, so the bookshelf shows instead of the book. Opening
  any book (`openBook`) clears the latch and normal resume behavior returns.
  This overrides the auto-open half of Rule B; an open-but-not-closed book
  still resumes across navigation exactly as before.

These must not be conflated: a same-route re-tap of the nav item is the *only*
nav trigger for a close; navigating away and back never closes the book. (The
epub reader has no "home" breadcrumb/back navigation of its own beyond the
reader close button and this nav escape hatch.)

### Mobile Layout

```
┌─────────────────────────────────┐
│  filename.epub           [✕][☰]  │
├─────────────────────────────────┤
│                                 │
│  ⏳ Making words interactive…  │
│                                 │
│  This is the first paragraph    │
│  of the chapter. Every word     │
│  is tappable to see its         │
│  dictionary definition.         │
│                                 │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─   │
│  これは章の最初の段落です。     │
│  各単語をタップすると辞書の     │
│  定義が表示されます。           │
│                                 │
│  Another paragraph follows.     │
│  Translation is toggled via     │
│  the switch below.              │
│                                 │
│   ◀  3 / 12  ▶  Trans [====●]  │
└─────────────────────────────────┘
```

The sidebar (not shown) is a slide-over panel from the right, toggled by the ☰ button. It matches the web sidebar layout: prev/next buttons, scrollable TOC tree with indented sub-chapters, current chapter highlighted.

### Upload State

```
┌─────────────────────────────────┐
│  EPUB Reader                    │
│                                 │
│  ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐  │
│  │                           │  │
│  │           ☰              │  │
│  │                           │  │
│  │  Drop an EPUB file here,  │  │
│  │  or click to browse       │  │
│  │                           │  │
│  │        [ Browse ]         │  │
│  │                           │  │
│  └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘  │
│                                 │
└─────────────────────────────────┘
```

The dashed border is a drop zone. On web, users can drag-and-drop `.epub` files onto this area. On mobile, tapping "Browse" opens the system document picker filtered to `.epub` files.

### Bookshelf (Home Screen)

```
┌───────────────────────────────────────────────┐
│  EPUB Reader                             [✕]  │
│                                               │
│  ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐   │
│  │        Drop an EPUB file here,         │   │
│  │        or click to browse   [ Browse ] │   │
│  └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘   │
│                                               │
│  [ 🔍 Filter by name…                   ✕ ]  │
│  ┌────────┐ ┌────────┐ ┌────────┐            │
│  │        │ │        │ │        │            │
│  │ Cover  │ │ Cover  │ │ Cover  │            │
│  │        │ │        │ │        │            │
│  │ 42% ▓▓ │ │ 18% ▓▓ │ │  7% ▓▓ │            │
│  └────────┘ └────────┘ └────────┘            │
│   book-a.epub  book-b.epub  book-c.epub      │
│   (most recently read first)                 │
└───────────────────────────────────────────────┘
```

The home screen shows a grid of stored books sorted by `lastReadAt` descending. Each card shows the stored cover (or a placeholder), the file name, and a progress bar with a percentage. Covers are persisted as base64 data URLs — epubjs's `coverUrl()` returns a `blob:` URL that is invalidated on page refresh, so it is converted before saving and any leftover `blob:` values are treated as missing. Progress is computed as `readChars / totalChars` where both values come from the book's plain-text character counts: the hook loads each chapter once in the background, caches per-chapter counts in IndexedDB, and updates `readChars` as the user pages through chapters (prefix of completed chapters + the anchor offset within the current chapter). Closing a book keeps its handle; tapping a card reopens it at the saved chapter/page. The shelf has no separate "My Books" heading; a full-width name-filter input (styled as the standard shadcn input, password-manager autofill disabled) sits above the grid.

Uploads never open a book — dropping or selecting one or more `.epub` files just adds them to the shelf (the reader stays on the home screen). Extracted **folder EPUBs** (directories named `*.epub`, common from macOS/iOS/Calibre) are also accepted: web zips them back into an EPUB in memory from drag-and-drop or the folder picker; mobile detects `isDirectory` assets and does the same with JSZip. Valid files are imported even when some fail; files that fail validation or parsing are skipped and reported in an "Import Issues" dialog listing each file's name, size, and the reason it was rejected. When the shelf is empty the drop zone renders as a full-width row; once books exist it becomes an inline dashed "add book" slot tile after the last book card.

Hyperlinks inside chapters are tokenized like the rest of the text; tapping a linked word opens the dictionary popup with an "Open in Reader" action. Internal EPUB links (chapter files, `#anchor` fragments) navigate within the book — loading the target chapter and seeking to the anchor's text — while external `http(s)` links open in the web reader.

The side panel has two tabs: **Chapters** (the TOC) and **Search**. Search runs against a per-book plain-text index (built once per book in the background and cached in a separate IndexedDB store), showing up to 30 matches with a two-line snippet (term highlighted) and the muted chapter label. Clicking a result loads that chapter and seeks to the match's page via the same text-anchor mechanism used for bookmarks; recent searches are kept in `localStorage`.

### Cover State

```
┌─────────────────────────────────┐
│  my-book.epub               [✕] │
│                                 │
│                                 │
│     ┌───────────────────┐       │
│     │                   │       │
│     │                   │       │
│     │   [Cover Image]   │       │
│     │                   │       │
│     │                   │       │
│     └───────────────────┘       │
│                                 │
│         Tap to open             │
│                                 │
└─────────────────────────────────┘
```

The cover is shown full-frame (mobile) or centered (web). Tapping anywhere on the cover or the "Tap to open" label dismisses it and loads the first chapter.

---

## UX Flow

```
                    ┌─────────────────────────┐
                    │  Open EPUB Reader tab    │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │ Show bookshelf:         │
                    │ covers + progress,      │
                    │ upload drop zone        │
                    └───┬────────────────┬────┘
                        │                │
             ┌──────────▼──────┐  ┌──────▼──────────┐
             │ Tap a book card │  │ Upload new file │
             └──────────┬──────┘  └──────┬──────────┘
                        │                │
                        │         ┌──────▼───────┐
                        │         │ Pick .epub   │
                        │         │ file         │
                        │         └──────┬───────┘
                        │                │
                        │         ┌──────▼───────┐
                        │         │ Parse EPUB:  │
                        │         │ TOC, spine,  │
                        │         │ cover        │
                        │         └──────┬───────┘
                        │                │
                        │         ┌──────▼───────┐
                        │         │ Show Cover   │
                        │         │ screen       │
                        │         └──────┬───────┘
                        │                │
                        │         ┌──────▼───────┐
                        │         │ User taps    │
                        │         │ cover        │
                        │         └──────┬───────┘
                        │                │
                        └───────┬────────┘
                               │
                    ┌──────────▼──────────┐
                    │  loadChapter()      │
                    │  → concat spine     │
                    │  → tokenize         │
                    │  → translate        │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │  Reading pane       │◄─────────────────────────────┐
                    │  (paginated text)   │                              │
                    └──────────┬──────────┘                              │
                               │                                         │
          ┌────────────────────┼────────────────────┬──────────────┐     │
          │                    │                    │              │     │
  ┌───────▼──────┐   ┌────────▼────────┐   ┌───────▼──────┐  ┌────▼───┐ │
  │ Tap word     │   │ Tap TOC item    │   │ ◀ / ▶ page  │  │ ✕ Close│ │
  └───────┬──────┘   └────────┬────────┘   └───────┬──────┘  └────┬───┘ │
          │                    │                    │              │     │
  ┌───────▼──────┐   ┌────────▼────────┐   ┌───────▼──────┐  ┌───▼────┐│
  │ Dictionary   │   │ loadChapter()   │   │ Clear trans  │  │ Close  ││
  │ popup: defs, │   │ → concat spine  │   │ → re-fetch   │  │ → back ││
  │ pron, examples│   │ → tokenize      │   │ tokens +     │  │ to     ││
  └──────────────┘   │ → translate    │   │ trans        │  │ shelf  ││
                     └────────┬────────┘   └───────┬──────┘  └───┬────┘│
                              │                    │              │     │
                              └────────────────────┴──────────────┘     │
                                               │                        │
                                               └────────────────────────┘
                                                       (back to reader)
```

---

## Tech Stack

| Layer | Web (`apps/web`) | Mobile (`apps/mobile`) |
|---|---|---|
| **Framework** | Next.js 14 (React 18) | React Native / Expo 57 |
| **Styling** | Tailwind CSS | NativeWind (Tailwind for RN) |
| **EPUB Parsing** | `epubjs` ^0.3.93 | `jszip` ^3.10.1 + hand-rolled XML parser |
| **HTML→Text** | `DOMParser` + `turndown` (→ Markdown) | Regex-based tag stripping |
| **Markdown→Blocks** | `marked` + `parseMarkdown` | `marked` ^18.0.7 + `parseMarkdown` |
| **Persistence** | IndexedDB (`epub-store.ts` + the `lp-epub-meta` mirror) | `FileSystem` library files + AsyncStorage `lp_epub_library_v1` |
| **File Picker** | `<input type="file">` + drag-and-drop | `expo-document-picker` ^57 |
| **Lemmatization** | `POST /lemmatize-normalized/batch` | Same Python endpoint |
| **Translation** | `POST /translate_array` | Same Python endpoint |
| **Icons** | `lucide-react` | `lucide-react-native` |

---

## EPUB Parsing Pipeline

### Web: epubjs + Whole-Book Model (SPEC-032)

`epubjs` parses the package (spine, TOC, cover, archive); `EpubBook` (`lib/epub-book.ts`) layers the book model on top:

```
ArrayBuffer
  │
  ▼
epubjs: ePub(arrayBuffer)
  │
  ├─ loaded.navigation.toc    →  nested TOC → TocNode tree
  ├─ loaded.spine             →  ordered content docs
  ├─ coverUrl()               →  stable data: URL
  └─ package.metadata         →  page-progression-direction
  │
  ▼
EpubBook.open()
  ├─ Canonical hrefs: resolve spine hrefs vs OPF dir AND TOC hrefs vs
  │   nav/NCX doc dir → zip-relative paths that actually match
  │   (fixes epubjs's never-aligned TOC hrefs)
  │
  ▼
getBlocks(spineIndex)
  ├─ section.load() → content document
  ├─ Image resolution: book.path.resolve() → archive.urlCache (blob URLs)
  └─ Browser-DOM walker → EpubBlock[] with source mapping
      (srcElementId per block, inline anchors with char offsets, ruby stripped)
  │
  ▼
BookLocation { spineIndex, blockIndex, offset }
  ├─ TOC entries / internal links / search hits / saved positions
  │   all resolve to a location (no text-anchor heuristics)
  │
  ▼
usePaginatedBook → whole-book page breaks (lazy, viewport-aware)
  ▼
EpubReaderPanel → TokenizedText → word tap → dictionary
```

### Mobile: JSZip → hand-rolled Parser Pipeline

```
File URI (from DocumentPicker)
  │
  ▼
FileSystem.readAsStringAsync(uri, base64)
  │
  ▼
JSZip.loadAsync(base64)
  │
  ├─ META-INF/container.xml  →  OPF path
  ├─ OPF file:
  │   ├─ Manifest: <item id, href, media-type, properties>
  │   ├─ Spine: <itemref idref>  →  ordered content doc list
  │   ├─ Cover: <meta name="cover">  →  cover image href
  │   └─ Guide: (not used)
  ├─ Nav document (EPUB 3): <item properties="nav"> → parseNavDocument()
  │   └─ <nav epub:type="toc"> → <ol>/<li>/<a href, label>
  └─ NCX (EPUB 2 fallback): .ncx file → parseNCX()
      └─ <navMap>/<navPoint> → <navLabel>/<content src>
  │
  ▼
EpubMetadata { spine, toc, coverBase64, opfDir }
  │
  ▼
loadChapter(href)
  │
  ├─ Find spine range: [startIdx, endIdx) from TOC boundaries
  ├─ Concatenate: for each spine item → zip.file(href).async('text')
  ├─ Regex HTML→text:
  │   ├─ Strip <head>, <style>, <script>
  │   ├─ <br>, </p>, </h[1-6]>, </div>, </li> → newlines
  │   ├─ Strip all remaining tags
  │   └─ Decode &amp; &lt; &gt; &quot; &#39;
  └─ Trim → plain text
  │
  ▼
parseMarkdownBlocks(text) → TextBlock[]
  │
  ▼
TokenizedText → word tap → dictionary
```

---

## Key Data Structures

### TocItem

Both platforms use the same interface:

```typescript
interface TocItem {
  label: string;     // Chapter title (from nav doc label or NCX navLabel)
  href: string;      // Resolved path to content document (fragment-stripped)
  children?: TocItem[];  // Nested sub-chapters
}
```

The TOC is always presented as a nested tree. `flatToc` (flattened with `flattenToc()`) is used for prev/next chapter navigation — users always move between logical TOC chapters, not raw spine items.

### Spine

The spine is the EPUB's ordered list of all content documents. It is the reading order of the book:

```typescript
// Web: epubjs spine.items[]
{ href: string, ... }  // epubjs Section object

// Mobile: from parseOPF()
{ href: string; title: string }  // title is always '' (not used)
```

### TextBlock (shared via parse-markdown)

```typescript
interface TextBlock {
  kind: 'text';
  type: 'heading' | 'paragraph' | 'list-item' | 'blockquote';
  depth?: number;   // heading level (1-6), only for headings
  text: string;     // Plain text content
}
```

### LemmatizedToken (from @langplayer/shared)

```typescript
interface LemmatizedToken {
  text: string;           // Surface form
  lemmas: Lemma[];        // Empty = non-word (space, punctuation)
  pronunciation?: string; // Phonetic guide (ja→katakana, zh→pinyin, etc.)
}
```

---

## Spine Concatenation Algorithm (obsolete on web)

The previous web implementation treated TOC entries as chapters and concatenated spine ranges between TOC boundaries. This was architecturally wrong: TOC entries are bookmarks, not units of content. Real books (e.g. 坊っちゃん: 11 TOC entries, 4 spine items) load the same spine range for every fragment-shared entry, duplicating pages, search results, and progress.

**SPEC-032 replaces this on web.** Each spine item is converted once; TOC entries resolve to `BookLocation` via canonical hrefs + `#fragment` → element id mapping. Mobile still concatenates ranges and is a follow-up migration target.

---

## Pagination (Mobile Only)

The web app uses a scrollable `ReaderPanel` — users scroll through chapters naturally. The mobile app uses **paginated page-based reading** to avoid performance issues with rendering hundreds of `TokenizedText` instances in a `ScrollView`.

### Algorithm

```
1. Hidden measuring view renders ALL blocks (opacity: 0, pointerEvents: none)
   └─ Each block's onLayout records its height in blockHeightsRef

2. Once all blocks measured (tracked via measuredBlockCount state):
   └─ Compute page breaks:
      for each block:
        if accumulated + blockHeight > windowHeight - 260:
          break here, start new page
        else:
          accumulate

3. Only render visibleBlocks (current page's blocks) in the visible view

4. On page turn (◀/▶): clear translations, re-compute visibleBlocks, re-fetch tokens
```

### Why a ref + state counter?

Block heights are stored in a `useRef` for O(1) writes without re-renders. But the page-break effect needs to know *when* to re-evaluate. Since ref mutations don't trigger re-renders, a `measuredBlockCount` state variable is incremented on each first-time measurement. The effect depends on `[blocks, windowHeight, measuredBlockCount]`, so it re-runs after each new measurement and proceeds when all blocks have heights.

### Per-page Tokenization & Translation

To avoid unnecessary API calls, only the visible page's text blocks are sent for lemmatization and translation:

- **Lemmatization**: `POST /lemmatize-normalized/batch` with only the current page's text blocks. Results are cached in `tokenCache` keyed by global block index.
- **Translation**: `POST /translate_array` with only the current page's text blocks. Waits for token loading to finish first. Cleared on page turn.

---

## Platform Quirks & Differences

### Parsing

| Aspect | Web | Mobile |
|---|---|---|
| **EPUB library** | `epubjs` (full EPUB 3 engine) | Hand-rolled `JSZip` + regex XML parser |
| **HTML→Text** | `DOMParser` + `turndown` → Markdown | Regex tag stripping + entity decoding |
| **Image handling** | Blob URLs from epubjs archive cache | Not supported (text-only) |
| **Ruby/furigana** | Stripped via DOM manipulation | Stripped during regex pass |
| **RTL detection** | `page-progression-direction` metadata | Not implemented |
| **TOC source** | epubjs `loaded.navigation.toc` | Manual parse of nav doc (EPUB 3) or NCX (EPUB 2) |
| **Fragment handling** | epubjs resolves internally | Manual `#fragment` stripping at multiple layers |

### Persistence

| Aspect | Web | Mobile |
|---|---|---|
| **Storage** | IndexedDB `lp-epub-store` v3 (one record per book, keyed by content hash; store `epubs`) + a small-value **metadata mirror** in `lp-epub-meta` (store `epub-meta`) | `FileSystem.documentDirectory/epub_library/<id>` + metadata in AsyncStorage `lp_epub_library_v1` |
| **What's stored** | Full EPUB/PDF binary (ArrayBuffer) + metadata, per book | The copied file + metadata (the picker URI is never persisted) |
| **Position** | `lastLocation { spineIndex, blockIndex, offset }` in the book metadata | Same `BookLocation` model |
| **Restore behavior** | On mount: list the shelf from the metadata mirror → auto-open the last-read book of the current L2 → resume at its saved location | On mount: `getInfoAsync` the library file → open it → resume at its saved location |
| **When the file is gone** | The book is listed (from the mirror), badged "could not read this file", and offers a one-click Remove — see § "Unreadable stored records" | `openBook` reports `Book file missing` and returns to the shelf |

The `epubs` store keeps the **binary** inline-or-external; Chromium writes large
values (any real book) to a separate file in the profile, so a record can become
permanently unreadable if that file is deleted. Never render a shelf card from
the binary — use the mirror (ADR-0049).

### Reading Mode

| Aspect | Web | Mobile |
|---|---|---|
| **Layout** | Scrollable (infinite scroll within chapter) | Paginated (fixed pages with prev/next buttons) |
| **Chapter transitions** | Scroll is continuous; prev/next chapter via sidebar | Page-by-page within chapter; chapter change via sidebar |
| **Measuring** | Not needed (scrollable) | Hidden measuring view computes page breaks |

### UI

| Aspect | Web | Mobile |
|---|---|---|
| **Upload** | Drag-and-drop zone + file/folder pickers | `DocumentPicker` (system file browser; extracted directories supported) |
| **Cover dismiss** | Cover rendered inside reader; tap to enter | Full-screen cover + "Open" button |
| **Sidebar** | Right-side panel (collapsible on narrow screens) | Slide-over panel from right (toggle via ☰ button) |
| **Icons** | `lucide-react` | `lucide-react-native` |
| **Responsiveness** | CSS breakpoints (`max-lg:flex-col`) | Fixed layout (mobile only) |

---

## File Map

### Web (`apps/web`)

```
src/
├── app/[l1]/[l2]/epub/page.tsx          ← Route: EPUB reader page
├── hooks/use-epub.ts                     ← Book-lifecycle hook (open/add/remove, search, saveLocation)
├── hooks/use-paginated-book.ts           ← Whole-book lazy pagination engine
├── lib/epub-book.ts                      ← EpubBook: epubjs + whole-book model (canonical hrefs, converter, locations)
├── lib/epub-book-types.ts                ← Shared book-model types (TocNode, BookLocation, EpubBlock, …)
├── lib/epub-store.ts                     ← IndexedDB persistence (v3: lastLocation + per-spine search index)
└── components/reader/
    ├── paginated-reader.tsx               ← Shared `PaginatedReader` panel (viewport, pager, bottom bar) — used by ALL readers
    ├── reader-block.tsx                   ← Shared per-block renderers (`ReaderTextBlock` / `ReaderMarkdownBlock`): the single `renderBlock` the EPUB, notes/web/image, and PDF readers inject into `PaginatedReader`. Only markdown URL transform, link handler, search highlight, and deferred tokenization differ per reader (pass-in props).
    ├── epub-upload.tsx                    ← Drag-and-drop UI
    ├── epub-chapter-sidebar.tsx           ← TOC tree with hierarchy + ancestor highlighting
    ├── epub-reader-panel.tsx              ← Block-driven reading pane (whole-book pages, tokens, translation)
    ├── reader-panel.tsx                   ← Notes / web-reader / image-reader panel (same `PaginatedReader` + `reader-block`)
    ├── pdf-reader-panel.tsx               ← PDF reader (same `PaginatedReader` + `reader-block`; thumbnails sidebar + page preview)
    └── reader-sidebar.tsx                 ← Shared responsive sidebar shell
```

### Mobile (`apps/mobile`)

```
app/(tabs)/(reading)/
├── epub.tsx                              ← Screen: EPUB reader (4 states + reader)
├── _layout.tsx                           ← Stack navigator registration
hooks/
└── use-epub.ts                           ← Core hook (JSZip, spine concat, persist)
lib/
├── epub-parser.ts                        ← OPF manifest/spine/TOC parser
└── parse-markdown.ts                     ← Markdown → TextBlock[] converter
components/
├── reader/epub-chapter-sidebar.tsx       ← TOC slide-over panel
└── TokenizedText.tsx                     ← Interactive word rendering
```

### Shared (`packages/shared`)

```
src/types.ts                              ← LemmatizedToken, Lemma interfaces
```

---

## Unreadable stored records (web and mobile)

A stored book's binary is a *large* IndexedDB value, which Chromium keeps in a
separate file in the profile rather than inline in LevelDB. Disk-cleanup tools
delete those files while the reference survives, after which every read of the
record fails with a DOMException — Chrome 132+:
`NotReadableError: Data lost due to missing file. Affected record should be
considered irrecoverable`; Chrome 130/131: `NotFoundError` +
`Failed to read large IndexedDB value`. The record can never be read again
(ADR-0049).

As built:

| Layer | Behavior |
|---|---|
| **Classification** | `isUnreadableRecordError()` in `lib/epub-store.ts`: `NotReadableError`, or the 130/131 `NotFoundError` pair → `'unreadable'` (irrecoverable). Anything else (`UnknownError`, `DataError`) → `'error'` (possibly transient). A transient failure is never presented as lost data. |
| **Metadata mirror** | `lp-epub-meta` (store `epub-meta`), a **separate, version-1 database** holding two rows per book: `meta:<id>` (name, progress, last location — measured at 431 bytes for a real novel, so it stays inline in LevelDB) and `cover:<id>` (the cover data URL, ~115 KB of base64 for that same novel, so it is a blob file that can be lost on its own). Written by `saveEpub` / `updateEpubMeta` (essential row first, in its own transaction), deleted by `deleteEpub`, backfilled the first time a pre-mirror record is listed. Separate on purpose: bumping `lp-epub-store`'s version could be blocked by another tab's connection, and a blocked `indexedDB.open` never settles. |
| **Shelf listing** | `listEpubs()` reads the mirror first and renders cards from it — **no book blob is read to list the shelf**. Mirror rows are read key-by-key (`getAllKeys()` → `get()`), so one unreadable row (e.g. a lost cover) cannot abort the walk; cover rows are read only for books whose metadata row was found. Only records the mirror does not know are read, one transaction each, with the failure isolated to that record (`unavailable: 'unreadable' \| 'error'`). If the library DB cannot be opened at all, the shelf is still listed from the mirror. |
| **Opening** | `useEpub.openBook` catches the read failure, sets `error = 'msg.epub_file_unreadable'`, records the id in `unreadable` (badge) and `openFailureId` (recovery notice). A missing record and an unparsable stored PDF report the same way. `openFailureId` — not a null return — is the failure signal, because a PDF open also resolves to a null location. |
| **UI** | Shelf: a recovery notice above the grid (message + book name + Remove/Close) and a badged card (warning icon, destructive tint, one-click Remove). Remove deletes the record, its mirror row and its search index; the user then imports the file again. The app never deletes a book on its own. |
| **Repair** | Writes replace an unreadable record: `saveEpub` retries without the merge-read (the read abort takes the `put` with it), and imports treat an unreadable existing record as absent — so re-importing the file is a complete fix. |
| **Robustness** | The page's mount effect sets `initialized` in `finally`; the error branch renders before the cover/locating spinners; `openDB()` rejects on `blocked` and closes on `versionchange` so it can never await forever; `loadBookIndex` drops an unreadable index row and reports "not indexed" so the next search rebuilds it. |
| **Observability** | `epubStorageErr()` (`lib/epub-log.ts`) logs on the app-wide error channel — **not** gated by the reader's verbose switch `EPUB_LOGS_ENABLED` — so `[LP Web] EPUB storage: openBook <id> could not read the stored record (unreadable): NotReadableError: …` prints at the default log level (1 in production, 2 in web dev). |

Mobile (same contract, different storage — sandbox files + AsyncStorage, so no
mirror and no blob files):

| Layer | Behavior |
|---|---|
| **Metadata read** | `readAll()` throws `EpubLibraryUnreadableError` when the stored library cannot be read. It used to return `[]`, which rendered an empty shelf **and** let the next write persist that empty list — wiping every stored book. Writers now fail instead of overwriting a list they could not read; only an absent key or unparseable content yields `[]` (the corrupt value is logged and replaced on the next save). |
| **File check** | `loadBooks()` stats each book's library file (`getInfoAsync`) and badges the ones that are gone (`unavailable: 'unreadable'`), so a deleted book is visible before it is tapped. |
| **Opening** | `openBook` reports `msg.epub_file_unreadable` for a missing file, a missing record and an unreadable library, and records `openFailureId`; a parse failure keeps `msg.epub_parse_error`. `error` therefore always holds a **translation key** (the screen renders `t(epub.error)`), where it previously stored raw English strings that the screen discarded for a generic parse-error message. |
| **UI** | The shelf badges the card (warning icon, destructive title + `msg.epub_unreadable_book`) beside the existing one-click Remove in the card menu, and the error state offers Remove (drops the dead entry and returns to the shelf) + Close. With two or more badged books, an `msg.epub_unreadable_books` bar removes every one of them in a single action (one shelf reload). |
| **Removals/updates that fail** | `removeBook` logs and still drops the card; `saveLocation` no longer rejects unhandled on every page turn (progress is lost for that turn, not the session); the document picker is inside the try so its rejection cannot escape to `onPress`. |
| **Import never destroys a working copy** | The picked file is copied to `<id>.importing`, unwrapped and content-hashed there, and only promoted over `<id>` once verified. Before, the destination was deleted first (a re-import targets the same name-derived id), so a failed copy or a failed unwrap destroyed the previously imported file; and the "already in library" branch deleted the destination, which is that same book's stored file when the ids match. Failed imports delete the staged copy, and `deleteEpubFiles` cleans up a staged leftover. |
| **Not covered** | There is no metadata mirror on mobile (the metadata is already in AsyncStorage, which the loss of a book *file* cannot damage), and no end-to-end device verification of these paths — they are covered by unit tests against a mocked AsyncStorage. |
| **Logout** | `wipeUserData()` removes the library metadata **and** `epub_library/` (plus the local-media sandbox and the Ask-AI transcripts). Leaving the files behind kept the previous user's content on disk, orphaned and unreachable — and for local media it also restored their video into the next user's player via `state.json`. The returning user loses nothing extra: the metadata that made those files usable was already wiped. |

Verified by deleting the record's blob file out of a Chromium profile
(`Default/IndexedDB/<origin>.indexeddb.blob/<db>/<shard>/<n>`) and reloading
`/[l1]/[l2]/epub`: the shelf renders with the badged card and the recovery
notice, no spinner, one diagnostic log line, and Remove clears both the record
and the mirror row. `lib/epub-store.test.ts` covers the same paths against a
fake IndexedDB (injected request error + transaction abort).

Mobile is not covered yet: its books are sandbox files with metadata in
AsyncStorage, and `useEpub.openBook` already checks `getInfoAsync` before
opening — but it stores the raw string `'Book file missing'` in `error`, which
the screen then renders as the generic `msg.epub_parse_error`. Surfacing an
i18n'd "file missing" state with the same Remove/re-import recovery there is a
tracked follow-up (ADR-0049, Neutral).

---

## Translation Keys

| Key | English |
|---|---|
| `title.epub_reader` | "EBook Reader" |
| `msg.drop_epub_here` | "Drop an EPUB file here, or click to browse" |
| `msg.epub_not_supported` | "Only .epub files are supported." |
| `msg.epub_parse_error` | "Could not open this EPUB file." (the stored file could not be parsed) |
| `msg.epub_file_unreadable` | "Could not read this file. It may be offline or inaccessible." (an import whose bytes could not be read **and** a stored record that can no longer be read) |
| `msg.epub_unreadable_book` | "Book no longer readable" — the short label for a book whose record is unreadable (the recovery notice's heading, and the title of a card whose name was lost with its record) |
| `msg.epub_unreadable_books` | `{n, plural, …}` — "N books can no longer be read", the bulk-removal bar's count |
| `msg.epub_chapter_error` | "Failed to load chapter." |
| `msg.last_epub` | "Last opened: {name}" |
| `action.browse` | "Browse" |
| `action.close` | "Close" |
| `action.previous_chapter` / `action.next_chapter` | Prev/next chapter |
| `msg.chapters` | "{n} chapters" |
| `msg.recognizing_text` | "Recognizing text…" (vision OCR in progress: PDF page → markdown, image reader) |

---

## Known Limitations

1. **No image support on mobile** — Images in EPUB content are not rendered. The regex-based HTML-to-text extraction strips all tags including `<img>`.
2. **No RTL support on mobile** — The web app detects `page-progression-direction="rtl"` from OPF metadata (reversed page-turn semantics); mobile does not.
3. **No ruby preservation** — Both platforms strip furigana/ruby annotations. This is intentional for language learning (user sees only base text, not pronunciation helpers), but means annotated Japanese texts lose furigana.
4. **Position restore (locations on both platforms)** — Web (SPEC-032) restores via `lastLocation { spineIndex, blockIndex, offset }`; mobile stores the same `BookLocation` shape (`{ blockIndex, offset }`) in its AsyncStorage metadata. The legacy ~40-char text anchor (`lastAnchor`) survives only as a migration field on pre-bookshelf records.
5. **epubjs TOC parsing gaps (web)** — epubjs never resolves nav-document hrefs against the nav doc's directory (fixed by `EpubBook`'s canonical hrefs) and drops TOC entries whose `<a>` isn't a direct `<li>` child (rare).
6. **Whole-book pagination is lazy** — Page breaks are computed around the current page; the displayed total is an estimate until the full pagination pass runs (background).
7. **No embedded font support** — EPUBs with embedded fonts for CJK characters won't render correctly.
8. **No CSS/formatting preservation** — Rich formatting (bold, italic, colors, alignment) is largely lost; the reader renders text-flow blocks with markdown-level structure (headings, paragraphs, lists, blockquotes).

## Resolved issues (2026-08-25)

- **Mobile library id collision** — `sanitizeEpubId` collapsed every non-ASCII
  run to `_`, so Japanese volumes differing only by `第１部/第２部/第３部` all
  produced the same id and the last import overwrote the earlier entries. It
  now appends a stable FNV-1a hash of the full file name (same name → same id,
  distinct names → distinct ids); `pickFile` reuses an existing entry's id by
  file name so pre-hash imports still update in place.
- **Mobile open-then-return race** — the mount-time auto-open and a manual
  book tap both passed the stale `openingId` state guard, launching two
  concurrent opens; the losing one's error path kicked the reader back to the
  bookshelf. Fixed with a synchronous `openingIdRef` guard in `handleOpenBook`
  (web parity), an in-flight `openLoadingRef` guard in `useEpub.openBook`, and
  a `tokenLoadGenRef`/`translateGenRef` bump in the pagination reset effect so
  the aborted batch's fallback can't write the old book's tokens into the new
  book's cache.
- **Mobile slow open** — image extraction was serial base64→file writes for
  every manifest image; it now pre-scans spine `<img src>` and extracts only
  referenced images, in parallel (capped at 4). Rendered images load as before
  (the URI callback resolves the same paths).
- **Mobile lazy import (web parity)** — importing an EPUB used to run the FULL
  `openEpubBook` conversion (read every spine item twice, extract images,
  convert spine→blocks). This made adding even small books slow while web
  (epubjs) only parses package metadata at import. Import now uses
  `inspectEpubBook` (`lib/epub-book.ts`): it parses OPF/nav/NCX + manifest and
  extracts the cover, then adds the book to the shelf with `totalChars: 0`.
  The heavy `openEpubBook` conversion is deferred until the book is actually
  opened, which then persists `totalChars` so the shelf progress bar works.
  Importing also no longer opens the single imported book — it only adds it to
  the bookshelf (the mount auto-open / a card tap opens it), matching the
  "Uploads never open a book" rule above. `parseEpubPackage`/`extractCover`
  are shared by both the inspect and full-open paths.

---

## Additions (2026-08-25) — PDFs, images, alt formats, reader UX

### PDF reader (web + mobile)
PDFs live on the same bookshelf (an `EpubMeta.format: 'pdf'` entry; the first
page is rendered at import as the shelf cover — pdf.js on web, a hidden
WebView hosting pdf.js on mobile). Opening a PDF **auto-opens page 1** in the
shared paginated reader and shows a **collapsible right-side thumbnails
sidebar** (standard Sidebar: desktop persistent panel / mobile slide-in
sheet). The sidebar lists every page in a **single centered column with 16px
inner padding**; thumbnails load **lazily** (an IntersectionObserver on web,
per-tile `onLayout` on mobile) so pages beyond the first pre-rendered ones
still appear as the sidebar is scrolled. It **outlines the current page**,
tapping a different page opens it, and tapping the **current** page opens a
**full-size zoomable preview modal** (shared `ZoomableImage`, same as the
image reader). Tapping a page renders it and sends the page image to the
DeepSeek Vision endpoint (`POST /vision`, `deepseek-v4-flash-vision-exp`,
cached server-side) with a "page → markdown" prompt; the returned markdown is
parsed into blocks and read in the shared paginated reader (tokenized words,
translation, text actions). On **web** the PDF reader injects the SAME shared
`ReaderTextBlock` / `ReaderMarkdownBlock` into `PaginatedReader` as the EPUB
and notes/web/image readers, so it gets the identical baseline-aligned,
sentence-highlighted translation and the draggable splitter (it previously
used a compact renderer that dropped that wiring). The bottom bar carries a
**TOC** button (the PDF outline/bookmarks) and a **Thumbnails** button that
**toggles the sidebar**.
The top-right reader close control is a `✕` close button; there is no
top-left thumbnails icon (the header uses a standard sidebar toggle). Web
rendering: `apps/web/src/lib/pdf-book.ts` + `components/reader/pdf-reader-panel.tsx`.
Mobile has **no PDF reader**: the standalone PDF screen landed in `64745e95`
and was rolled back by `a563180a` / `d53a6561`, so there is no
`lib/pdf-viewer.tsx` and no `components/reader/PdfReaderPanel.tsx` in
`apps/mobile`. See SPEC-089.

### Image reader (web + mobile)
The image reader is a **standalone route** (not an epub-bookshelf action),
listed as "Image Reader" in the Reading menu: web
`/[l1]/[l2]/image-reader` (`apps/web/src/app/[l1]/[l2]/image-reader/`),
mobile `(tabs)/(reading)/image-reader`
(`apps/mobile/app/(tabs)/(reading)/image-reader.tsx`). It accepts **multiple**
images via drag & drop or a multi-file picker, plus a **paste** button and
global **Ctrl/Cmd+V** clipboard-image paste (web `paste` event / `async
clipboard.read`; mobile `expo-clipboard` `getImageAsync`), then shows the
current image's OCR text in the paginated reader and a **thumbnail sidebar on
the right** (current image highlighted) that is collapsible like the standard
shared `Sidebar` (desktop persistent panel + mobile slide-in sheet) — a single
centered column of large thumbnails with 16px inner padding. Below the last
thumbnail the sidebar has a dashed **"add next image"** tile with
"Select files" and "Paste" buttons; those actions were removed from the title
bar, which also no longer has a back arrow. The first pasted/dropped/picked
image is opened by default and OCR'd immediately. The vision prompt asks for
clean markdown containing **only the text written in the image**, reflowed
like normal reading: each logical element (paragraph, sentence,
receipt/list/menu row, caption, speech bubble) is emitted as **one continuous
line** (wrapped image rows merged) with blank lines between elements, so
sentences reflow on both web and mobile and never fragment — no intro,
summary, description, translation, page/panel numbers, panel/sound-effect
labels, or code-fence wrapper, and an **optional** leading `# <title>` heading
(a human-readable image title the reader extracts for the title bar and
saved-word context when the image has an obvious title, instead of the raw
filename). The markdown is read in the paginated reader as a non-persistent
session. OCR is lazy per image and cached server-side by `/vision`.

Clicking the **current** image thumbnail opens a full-size **preview dialog**:
click/pinch (mobile) or Ctrl+wheel (web) toggles/zooms, and dragging pans while
zoomed; clicking a different thumbnail selects it. The gallery
**persists across navigation/refresh on web only** — an IndexedDB store
(`apps/web/src/lib/image-reader-store.ts`, store `lp-image-reader`); images with
no stored OCR result are re-OCR'd lazily on restore (server-cached). Mobile has
**no** image-reader store: `apps/mobile/lib/image-reader-store.ts` does not
exist and the mobile gallery lives in component state, so it is lost on restart
(SPEC-090 § Persistence is the authority here).

### Epub-like formats (.fb2 / .mobi / .azw3)
`packages/utils/src/alt-formats.ts` (pure TS, shared) converts FictionBook
(FB2 XML) and MOBI/AZW3 (PDB + MOBI header + PalmDOC LZ77 decompression per
the canonical libmobi algorithm; HUFF/CDIC-compressed and encrypted books are
rejected) into a normalized `{ title, toc, xhtml }`, then packs a minimal
valid EPUB 3 zip (`buildMinimalEpub`) so both apps' existing book models
(epubjs web / JSZip mobile) handle spine, pagination, search, and position
persistence unchanged. TOC extraction is best-effort for MOBI (guide/toc page
links, falling back to headings).

### Paginated reader UX changes
- **Space scrolls the page** (Shift+Space scrolls up); it never turns the
  page (SPEC-087 keyboard section updated).
- **Short pages mid-align** vertically (immersive epub reader).
- **Translation-sentence highlight** strengthened (`bg-primary/25 text-primary`)
  for dark-mode visibility.
- **Content-container clamp**: the text column's maximum width is
  `min(CONTENT_CONTAINER_WIDTH, screen − 2 × L)` — the container width
  (1248 px = the top bar's max-w-7xl content span, logo → avatar) on wide
  screens, or the screen minus a leading margin per side on phones — with
  leading margins on BOTH sides (was left=leading/right=16px).
- **Chromeless controls**: chromeless mode shows "show toolbars" + "close"
  buttons top-right, vertically centred on the site top bar's middle
  (revised 2026-09-01; previously aligned with the chapter title);
  chrome-visible mode has NO close button (SPEC-085 §17.1 updated).
- **Long-page arrow**: a floating down-arrow above the page counter scrolls
  an overflowing page to the bottom.

### Popup dictionary context sentence
The popup dictionary shows the sentence the tapped word came from behind a
collapsible "Context sentence" button — expanded as tokenized text wrapped in
the text action menu (copy/speak/AI explain/translate) plus its L1
translation (fetched once). `TokenizedText` gained a `disablePopup` prop so
the in-popup sentence can't stack a nested popup. The toggle is styled like
the "Let DeepSeek explain" / "Search images" buttons (w-full outline).

### Popup dictionary position & loading
The popup dictionary is anchored a **fixed distance from the top of the
screen** and grows downward only, so its top edge (and the header/word under
it) never shifts as entries load: web pins the dialog at `POPUP_TOP = 96`
(horizontally centered; the spawn-from-token enter animation settles at the
anchored position); mobile keeps the bottom sheet below 768 but anchors the
md+ dialog at `insets.top + 64` instead of centering it (SPEC-052's
bottom-sheet policy updated accordingly). While entries or phrase cards load,
the popup shows **dictionary-card skeletons** (`DictionaryEntryCardSkeleton`,
web + mobile) instead of spinners. Only the **head word** of an entry card
navigates to the detail page in the popup (`headOnlyLink`); sidebar/search
cards keep whole-card navigation. The save control is a small labeled
"Save Word" button (icon + text) rather than a bare bookmark icon.

### Reader chrome guard on dialog close
Quitting a dialog that overlays the reader (popup dictionary, TOC, Search)
never toggles the immersive chrome. The click that dismisses a Radix dialog
(web) can fall through to the reader's blank-tap surface after the overlay
unmounts (a slow click-and-hold), and on mobile the dismissing tap can land
on the surface once the overlay's pointerEvents flip to 'none'. A shared
reader-tap-guard (web `lib/reader-tap-guard.ts`, mobile `lib/reader-tap-guard.ts`)
arms `suppressReaderTap()` whenever a reader dialog closes; the tap
handlers/`toggleChrome` ignore taps inside the window. On web, taps are also
ignored while any dialog overlay is still mounted (open or animating out),
matching SPEC-085 §11.

### Mobile file handling — UNIMPLEMENTED (removed)
> **Status: unimplemented / removed.** The OS file-open feature was implemented
> in `6ec2de25` but **discarded** because a Release (TestFlight) build
> black-screens at launch with a fatal
> `[runtime not ready]: TypeError: Cannot read property 'timeout' of undefined`
> during JS bundle evaluation (no crash report; Debug builds are unaffected).
> The failure could not be traced to a specific source line — the working Debug
> build and the broken Release ship identical mobile source — so the feature was
> reverted rather than carried through the bug.

OS file-open (iOS CFBundleDocumentTypes / Android VIEW intent filters) and an
in-app routing layer (`apps/mobile/lib/file-open.ts`) would send audio/video
(+.srt) to the local media player, ebooks/PDFs to the ebook reader, .txt/.md to
the notes reader (as a new note), and images to the image reader. **This is no
longer present** — `lib/file-open.ts` is deleted, the `CFBundleDocumentTypes` /
VIEW intent filters are removed from `app.config.js`, and no screen consumes
OS-opened files. Files are still importable via the in-app pickers (media,
bookshelf, image reader, notes). Re-adding this feature should be treated as
new work and revalidated against a Release build before shipping.
