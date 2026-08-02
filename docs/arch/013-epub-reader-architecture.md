# EPUB Reader Architecture

> **Status:** As-Built  
> **Date:** 2026-07-25  
> **Scope:** Next.js Web (`apps/web`), React Native Mobile (`apps/mobile`)  
> **See also:** [Next.js Dictionary Architecture](./007-nextjs-dictionary-architecture.md), [Settings Architecture](./011-settings-architecture.md)  
> **Source:** `apps/web/src/hooks/use-epub.ts`, `apps/mobile/hooks/use-epub.ts`, `apps/mobile/lib/epub-parser.ts`

---

## Overview

The EPUB Reader lets users upload `.epub` ebooks, navigate their table of contents, and read chapters with interactive word lookup (lemmatization + dictionary popup) and optional translation — the same language-learning features available for video subtitles and web articles. Both web and mobile share identical UX and parsing logic, differing only in the I/O layer (epubjs + DOMParser on web; JSZip + hand-rolled XML parser on mobile).

Every book the user opens gets its own persistent handle on web (an IndexedDB record keyed by a SHA-256 hash of the file), so returning to the reader shows a **bookshelf** of covers sorted by last read, each with a percentage-completed indicator derived from character counts. Opening a book resumes at its saved chapter and page instead of reopening the same book automatically. Mobile still stores a single `epub_state.json` — the bookshelf is a web-only feature for now.

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
│  My Books                                     │
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

The home screen shows a grid of stored books sorted by `lastReadAt` descending. Each card shows the stored cover (or a placeholder), the file name, and a progress bar with a percentage. Covers are persisted as base64 data URLs — epubjs's `coverUrl()` returns a `blob:` URL that is invalidated on page refresh, so it is converted before saving and any leftover `blob:` values are treated as missing. Progress is computed as `readChars / totalChars` where both values come from the book's plain-text character counts: the hook loads each chapter once in the background, caches per-chapter counts in IndexedDB, and updates `readChars` as the user pages through chapters (prefix of completed chapters + the anchor offset within the current chapter). Closing a book keeps its handle; tapping a card reopens it at the saved chapter/page.

Uploads never open a book — dropping or selecting one or more `.epub` files just adds them to the shelf (the reader stays on the home screen). Valid files are imported even when some fail; files that fail validation or parsing are skipped and reported in an "Import Issues" dialog listing each file's name, size, and the reason it was rejected. When the shelf is empty the drop zone renders as a full-width row; once books exist it becomes an inline dashed "add book" slot tile after the last book card.

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
| **Persistence** | IndexedDB (`epub-store.ts`) | `FileSystem` JSON file (`epub_state.json`) |
| **File Picker** | `<input type="file">` + drag-and-drop | `expo-document-picker` ^57 |
| **Lemmatization** | `POST /lemmatize-normalized/batch` | Same Python endpoint |
| **Translation** | `POST /translate_array` | Same Python endpoint |
| **Icons** | `lucide-react` | `lucide-react-native` |

---

## EPUB Parsing Pipeline

### Web: epubjs → turndown Pipeline

```
ArrayBuffer
  │
  ▼
epubjs: ePub(arrayBuffer)
  │
  ├─ b.loaded.navigation.toc  →  TocItem[] (nested chapters)
  ├─ b.loaded.spine            →  Spine (ordered content docs)
  ├─ b.coverUrl()              →  data:image/... URL
  └─ b.package.metadata        →  page-progression-direction
  │
  ▼
loadChapter(href)
  │
  ├─ Find spine range: [startIdx, endIdx) from TOC boundaries
  ├─ Concatenate: for each spine item → item.load() → contents.innerHTML
  ├─ DOMParser: parse combined HTML
  ├─ Image resolution: b.path.resolve() → archive.urlCache
  ├─ Ruby stripping: remove <rt>/<rtc>, keep base text
  └─ turndown: HTML → Markdown
  │
  ▼
parseMarkdownBlocks(md) → TextBlock[]
  │
  ▼
ReaderPanel → TokenizedText → word tap → dictionary
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

## Spine Concatenation Algorithm

This is the most architecturally significant logic. Many EPUBs split a logical chapter across multiple spine items (content documents). For example:

```
TOC:
  "Chapter 1" → ch1.xhtml
  "Chapter 2" → ch2.xhtml

Spine:
  [0] cover.xhtml         (not in TOC)
  [1] ch1.xhtml           (TOC: Chapter 1)
  [2] ch1-continued.xhtml (not in TOC — belongs to Chapter 1)
  [3] ch2.xhtml           (TOC: Chapter 2)
```

When the user loads "Chapter 1", the algorithm:

1. Finds `startIdx = 1` (where `ch1.xhtml` appears in spine)
2. Finds `endIdx = 3` (where the next TOC entry, `ch2.xhtml`, appears)
3. Concatenates all spine items in `[1, 3)` → `ch1.xhtml + ch1-continued.xhtml`

Both web and mobile implement this identically:

```typescript
// Build set of TOC hrefs as chapter boundaries
const tocHrefs = new Set(
  flatToc.map(t => t.href.split('#')[0])
);

// Locate this chapter in the spine
const startIdx = spine.findIndex(s => s.href === cleanHref);

// Find the next TOC boundary
let endIdx = spine.findIndex(
  (s, i) => i > startIdx && tocHrefs.has(s.href)
);
if (endIdx === -1) endIdx = spine.length;  // last chapter → include all remaining

// Concatenate
for (let i = startIdx; i < endIdx; i++) {
  combinedText += loadSpineItem(spine[i].href);
}
```

**Edge case:** The first spine item may not be a TOC entry (cover page, frontmatter). When `openFromCover` is called, it passes the first spine item's href to `loadChapter`. The algorithm finds `startIdx = 0` and `endIdx` at the first TOC entry — so cover/frontmatter HTML is included at the start of the first chapter. This is intentional (matches web behavior).

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
| **Storage** | IndexedDB (`lp-epub-store`, store `epubs`, key `"current"`) | `FileSystem.documentDirectory/epub_state.json` |
| **What's stored** | Full EPUB binary (ArrayBuffer) + metadata | File URI + metadata (binary stays in app cache) |
| **Position** | Last chapter href + text anchor (~40 chars of first visible text block) | Last chapter href + text anchor (~40 chars of first visible text block) |
| **Restore behavior** | On mount: reload binary from IndexedDB → navigate to last chapter → seek to anchor page | On mount: check if file still exists → load from URI → navigate to last chapter → seek to anchor page |

### Reading Mode

| Aspect | Web | Mobile |
|---|---|---|
| **Layout** | Scrollable (infinite scroll within chapter) | Paginated (fixed pages with prev/next buttons) |
| **Chapter transitions** | Scroll is continuous; prev/next chapter via sidebar | Page-by-page within chapter; chapter change via sidebar |
| **Measuring** | Not needed (scrollable) | Hidden measuring view computes page breaks |

### UI

| Aspect | Web | Mobile |
|---|---|---|
| **Upload** | Drag-and-drop zone + file picker | `DocumentPicker` (system file browser) |
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
├── hooks/use-epub.ts                     ← Core hook (epubjs, turndown, spine concat)
├── lib/epub-store.ts                     ← IndexedDB persistence
└── components/reader/
    ├── epub-upload.tsx                    ← Drag-and-drop UI
    ├── epub-chapter-sidebar.tsx           ← TOC tree + prev/next nav
    ├── reader-panel.tsx                   ← Shared reading pane (text + dictionary)
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

## Translation Keys

| Key | English |
|---|---|
| `title.epub_reader` | "EPUB Reader" |
| `msg.drop_epub_here` | "Drop an EPUB file here, or click to browse" |
| `msg.epub_not_supported` | "Only .epub files are supported." |
| `msg.epub_parse_error` / `msg.epub_file_unreadable` | "Could not open this EPUB file." |
| `msg.epub_chapter_error` | "Failed to load chapter." |
| `msg.last_epub` | "Last opened: {name}" |
| `action.browse` | "Browse" |
| `action.close` | "Close" |
| `action.previous_chapter` / `action.next_chapter` | Prev/next chapter |
| `msg.chapters` | "{n} chapters" |
| `msg.making_words_interactive` | "Making words interactive…" |

---

## Known Limitations

1. **No image support on mobile** — Images in EPUB content are not rendered. The regex-based HTML-to-text extraction strips all tags including `<img>`.
2. **No RTL support on mobile** — The web app detects `page-progression-direction="rtl"` from OPF metadata; mobile does not.
3. **No ruby preservation** — Both platforms strip furigana/ruby annotations. This is intentional for language learning (user sees only base text, not pronunciation helpers), but means annotated Japanese texts lose furigana.
4. **Position restore matches web** — On re-opening an EPUB, the mobile app now restores both the last chapter and the last-read page within that chapter (via a ~40-char text anchor), matching the web app behavior.
5. **Single EPUB at a time** — Both platforms store only one EPUB. Opening a new one replaces the old.
6. **No embedded font support** — EPUBs with embedded fonts for CJK characters won't render correctly.
7. **No CSS/formatting preservation** — Rich formatting (bold, italic, colors, alignment) is lost. The reader renders everything as plain text with markdown-level structure (headings, paragraphs, lists, blockquotes).
