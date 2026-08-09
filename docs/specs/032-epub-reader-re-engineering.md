# SPEC-032: EPUB Reader Re-Engineering — Whole-Book Model

## Metadata
- **Spec ID**: SPEC-032
- **Feature**: Re-engineer the web EPUB reader around the book model (spine flow + TOC bookmarks + whole-book pagination)
- **Status**: implemented (2026-08-02; commits `78134763`, `7e79aa2d`, `4de46c5d`)
- **Created**: 2026-08-02
- **Revised**: 2026-08-02 — web keeps `epubjs` + `turndown`; the whole-book model is built on top of epubjs instead of a new shared parser package (see "Proposed architecture")
- **ROADMAP Phase**: Phase 4 (Reading)
- **See also**: [EPUB Reader Architecture](../arch/013-epub-reader-architecture.md), [ADR-0012 (Custom EPUB Parser)](../adr/0012-custom-epub-parser-mobile.md), [SPEC-012 (EPUB Images)](012-epub-image-rendering.md)

## Overview

The web EPUB reader currently treats **TOC entries as chapters**: clicking a TOC item loads the spine range between two TOC boundaries, paginates that range in isolation, and stores position as a chapter href plus a 40-character text anchor. This is the "square in a round hole" the reader has been fighting. EPUBs are not structured that way. An EPUB has a **spine** — the ordered list of content documents that defines the reading flow — and a **TOC** — a tree of *bookmarks* that point at positions inside spine items. One spine item can contain many TOC entries (each a `#fragment` anchor), and many spine items have no TOC entry at all.

This spec replaces the chapter-at-a-time model with a **whole-book model**:

1. A **book-model layer** on top of `epubjs` (web): spine + TOC parsed into a book object with **full TOC hierarchy**, TOC hrefs canonically resolved (fixing an epubjs gap), and each content document converted once into a block stream.
2. A **continuous book flow**: every linear spine item is converted once into content blocks; the blocks form one global stream in spine order. TOC entries, internal links, search results, and saved positions are all resolved to **locations** (`spineIndex` → `blockIndex` → char `offset`) in that stream.
3. **Whole-book pagination**: page breaks are computed over the global block stream (viewport-aware, lazy), so page numbers are continuous across the entire book and "next/previous" turn real pages, not chapters.
4. **Whole-book search**: an index built per spine item (not per TOC entry) so results cover the entire book with no duplicates and navigate by location.

Interactive word lookup, per-page translation, the bookshelf, covers, and progress persistence all stay; their inputs become more reliable.

## Terminology — untangling the terms

A quick glossary, because most of the confusion around EPUB reading comes from a handful of near-synonyms and overloaded words. The pairs that are easiest to mix up get called out explicitly at the end.

### The package

- **EPUB** — a ZIP archive that packages a whole book: metadata, content files, images, and navigation.
- **OPF (package document)** — the `content.opf` file that describes the book: `<metadata>` (title, author, language), `<manifest>` (every resource), and `<spine>` (reading order). The container file (`META-INF/container.xml`) points the reader at it.
- **Manifest** — the OPF's catalog of every resource in the package. Each `<item>` has an `id`, an `href`, a `media-type`, and optional `properties` (e.g. `nav`, `cover-image`). The spine and TOC reference content *by manifest entries*.
- **Media type** — the declared format of a manifest item (`application/xhtml+xml`, `image/jpeg`, `application/x-dtbncx+xml`, …). The reader uses it to know what a resource is before opening it.

### Reading order

- **Spine** — the `<spine>` element: an ordered list of `<itemref>`s that point at manifest items. It defines the reading order of the book — the flow. In this spec, "spine" also means the model's list of spine items.
- **Spine item / content document / spine document** — one XHTML file in the spine. These three are synonyms: "spine item" is the entry in the spine list, "content document" is the file itself. A spine document is **not** a chapter — it is a file, and one file commonly contains several chapters' worth of content.
- **Linear / non-linear** — an `itemref` attribute (`linear="yes|no"`). Linear items are the primary reading content; non-linear items are auxiliary (e.g. a printed TOC page, endnotes). Most readers exclude non-linear items from the main paginated flow.

### Navigation

- **TOC (table of contents)** — the book's hierarchical navigation tree. It is a *structure*, not a file, and it can be encoded two different ways (below). Every TOC node is a **bookmark**, never a chunk of content.
- **Nav document** (EPUB 3) — an XHTML file (typically `nav.xhtml`) whose `<nav epub:type="toc">` element holds the TOC as nested `<ol>/<li>/<a>`. Nav documents are also where page-lists and landmarks live.
- **NCX** (EPUB 2) — a separate XML file (`toc.ncx`, media-type `application/x-dtbncx+xml`) holding the same TOC as `<navMap>`/`<navPoint>`s. NCX is the EPUB 2 predecessor of the nav document: same job, different file format. A book usually has one or the other (occasionally both — prefer the nav document).
- **TOC entry** — one node in the TOC tree: a label plus an href. A TOC entry is a *pointer* into the spine flow, not a unit of content. When the UI says "chapter", it means "the location a TOC entry points to".
- **Fragment (fragment identifier / anchor)** — the `#name` part of an href, e.g. `ch1.xhtml#section-2`. It addresses an element *inside* a content document. One spine document can contain many fragments, and many TOC entries can point into the same document.
- **Text anchor** — **not** an EPUB term. This is the current implementation's ~40-character text snippet used to seek back to a saved page. It is a workaround this spec eliminates; do not confuse it with a fragment anchor.

### Positions

- **Location** — this spec's position type: `{ spineIndex, blockIndex, offset }`, resolved against the converted block stream. Everything — TOC jumps, internal links, search results, saved positions — navigates by location.
- **CFI (Canonical Fragment Identifier)** — the EPUB standard's location format (`epubcfi(/6/4[chap01]!/4/2/1:0)`). Same idea as our location, but standardized against the original document tree. We use a simplified block-stream location instead (see Non-goals).
- **Block** — one rendered unit (paragraph, heading, list item, image) produced from a content document by our converter.

### Easy to mix up

| Confusable pair | They are not… | They are… |
|---|---|---|
| **Spine vs TOC** | two ways of listing the chapters | the spine is the actual reading order of files; the TOC is a tree of bookmarks into it |
| **Spine item vs TOC entry** | the same thing seen twice | a spine item is one file; a TOC entry is one bookmark, and many bookmarks can point into one file |
| **Nav document vs NCX** | two different kinds of TOC | two *formats* for the same TOC — nav document is EPUB 3, NCX is EPUB 2 |
| **Fragment vs text anchor** | interchangeable anchors | a fragment is a standard `#id` pointer to an element; a text anchor is our fragile text-snippet workaround (removed) |
| **Manifest vs spine** | the same list | the manifest is the catalog of all resources; the spine is the ordered subset that forms the reading flow |
| **Chapter vs TOC entry** | synonyms | "chapter" is a UI concept; a TOC entry is the bookmark that locates it |

## Background — how EPUBs are actually structured

An EPUB is a ZIP archive. The three files that define a book:

```
book.epub
├── META-INF/container.xml     → points to the OPF package document
├── OEBPS/content.opf          → the package document
│     ├── <metadata>           → title, author, language, cover meta
│     ├── <manifest>           → every resource: id → href, media-type, properties
│     ├── <spine>              → reading order: <itemref idref="..."> list
│     │                          (linear="yes|no", page-progression-direction)
│     └── <guide> (EPUB 2)     → legacy landmark list
├── OEBPS/toc.ncx (EPUB 2)     → NCX navigation: <navMap>/<navPoint>/<content src>
├── OEBPS/nav.xhtml (EPUB 3)   → nav document: <nav epub:type="toc"> with nested <ol>/<li>/<a>
└── OEBPS/Text/ch1.xhtml ...   → content documents referenced by the spine
```

Key facts that drive this re-engineering:

- **The spine is the book.** It is an ordered list of content documents (XHTML files). The reading flow is the spine, in order. Each entry can be marked `linear="no"` for auxiliary content (e.g., a printed TOC page, endnotes).
- **The TOC is not a list of chapters-in-files.** EPUB 3 encodes it in the nav document's `<nav epub:type="toc">` (nested `<ol>/<li>/<a href>`); EPUB 2 uses the NCX (`<navMap>` of nested `<navPoint>`s, each with `<navLabel>` + `<content src="doc.xhtml#frag">`). Both are **hierarchical**, and every entry is just a `href` — a spine item path plus an optional `#fragment` anchor. A single spine item (e.g., `part1.xhtml`) routinely contains several TOC entries (`#ch1`, `#ch2`, …).
- **Locations in EPUB are standardized as CFIs** (`epubcfi(/6/4[chap01]!/4/2/1:0)`): spine position + a path through the content document's element tree + a character offset. Real readers (Readium, epub.js, Foliate) paginate the whole book and treat chapters as jump targets that resolve to a position.
- **Page progression** (`page-progression-direction="rtl"` on `<spine>`) tells readers whether the book reads right-to-left.

The lesson: **chapters are not units of content; they are bookmarks into the spine flow.** Our reader should model the spine as the flow, and the TOC as bookmarks into it.

## Why the current model fails

### Evidence from real books

Audited 2026-08-02 against the fixtures in `tmp/testing-assets/epub/` (same books the app is tested with):

| Book | Spine items | TOC entries | TOC entries sharing a spine item | Spine items with no TOC entry | TOC depth |
|---|---|---|---|---|---|
| 坊っちゃん (Botchan, ja) | 4 | 11 | **10** | 3 | 1 (NCX) |
| 雪国 (Snow Country, ja) | 12 | 4 | 0 | **8** | 1 (NCX) |
| 白夜行 (Midnight Sun, ja) | 33 | 14 | 0 | **19** | 1 (NCX) |
| 1Q84 BOOK1 (ja) | 33 | 28 | 0 | 5 | 1 (NCX) |
| 秘密 (ja) | 11 | 2 | 0 | 9 | 1 (NCX) |
| Engels, Condition of the Working Class (en) | 67 | 68 | 4 | 3 | **3** (NCX) |
| Kant, Was ist Aufklärung (de) | 5 | 3 | 0 | 2 | 1 (NCX) |

TOC depth counts actual tree levels only (navPoint / `<li>` nesting), *not*
the enclosing container: `navMap` (NCX) / `<nav epub:type="toc">` (EPUB 3)
is level 0, so a flat chapter list is depth 1 and matches the indentation the
sidebar renders. The NCX `<docTitle>` (e.g. Botchan's "UnKnown") is not a TOC
node and is excluded.

### Failure modes

1. **TOC entries are not chapters.** Botchan has 11 TOC entries but only 4 spine items — chapters 一, 二, 三, … are fragments inside shared spine documents. The current `loadChapter()` strips the fragment and computes a spine range, so **every one of those 10 entries loads the same full spine range**: identical pages, identical search results (10× duplicates), and progress counts the same text ten times.

2. **Fragment anchors are discarded.** The code resolves a fragment to a ~40-char text snippet and later re-seeks by text. Text anchors are fragile: duplicates match the first occurrence, whitespace normalization can drift from markdown-rendered text, and a snippet that spans a block boundary silently fails to seek.

3. **The TOC parsing is buggy and lossy.** We use `epubjs`'s `navigation.toc`, and its parser:
   - reads only the **first direct `<ol>`** under `<nav epub:type="toc">` and only **direct `<a>`/`<span>` children of `<li>`** (`node_modules/epubjs/src/navigation.js`). Entries wrapped in `<div>`/`<p>` or nested in `<ul>` are silently dropped, so hierarchy and entries disappear;
   - **never resolves nav hrefs against the nav document's directory** (`book.js` `loadNavigation()` loads the nav doc and hands the raw XML to `Navigation`; `navItem()` uses `href` as-is). If the nav document lives in a subdirectory (e.g., `OEBPS/toc/nav.xhtml`), every href is wrong, `findIndex()` fails, and the chapter loads empty — which is exactly the "some in-book searches fail" / empty-chapter class of bugs.

4. **Search is indexed per TOC chapter.** The index is keyed by TOC href, so fragment-shared spine items are indexed multiple times (duplicates) and spine items with no TOC entry are never indexed (misses). Frontmatter (cover, title, copyright) gets swallowed into chapter 1; notes/colophon at the end are unreachable by search.

5. **Pagination restarts at every chapter.** Page breaks are recomputed for each loaded chapter, so page 3 of chapter 2 and page 3 of chapter 3 are different page spaces; there is no "page 47 of 612". Progress is computed by prefix-summing per-chapter character counts, which double-counts when TOC entries share spine items.

6. **Two divergent parsers.** Web uses `epubjs` + `turndown`; mobile hand-rolls JSZip + regex (ADR-0012). Fixes don't cross-pollinate, and web carries ~140KB of epubjs plus turndown for features we never use (CSS layout, fonts, rendering).

## Goals

- Model the book correctly: spine = flow, TOC = hierarchical bookmarks, positions = locations.
- Whole-book pagination with continuous page numbers and whole-book prev/next.
- A TOC sidebar that renders the real hierarchy and highlights the current entry (including ancestors).
- Whole-book search that covers every spine item exactly once and navigates to precise locations.
- Reliable position restore (no text-anchor heuristics).
- Keep `epubjs` for package parsing and `turndown` for the article reader — no new parser dependencies.
- Fix the epubjs TOC gap (hrefs never resolved against the nav document's directory) with a small canonical-href layer.

## Non-goals

- Rendering original EPUB CSS/layout, embedded fonts, or fixed-layout EPUBs (the reader is intentionally a text-flow reader).
- Full CFI support (we define our own simpler location over our block stream; see below).
- RTL mirror-layout (v1 reverses next/prev semantics only — same as today).
- Mobile keeps its own hand-rolled parser (ADR-0012) for now; unifying the parsers is a future, separate effort.

## Proposed architecture

### 1. Book-model layer on `epubjs` — `apps/web/src/lib/epub-book.ts` (new)

`epubjs` keeps doing what it is good at: opening the ZIP, parsing the OPF (manifest/spine/cover), loading nav/NCX documents, and reading content documents. A new ~350-line `EpubBook` wrapper adds the parts epubjs lacks:

```
EpubBook.open(ArrayBuffer)
  ├─ epubjs                 → spine[], TOC, cover, metadata (as today)
  ├─ canonical hrefs        → resolve spine hrefs vs OPF dir AND TOC hrefs vs
  │                           the nav/NCX document's dir, so they match
  ├─ TocNode tree           → epubjs nested TOC mapped to the shared shape
  └─ getBlocks(spineIndex)  → DOM converter → EpubBlock[] with source mapping
```

Responsibilities:

- **Canonical href resolution**: `spine.items[].href` is the raw OPF-relative string and `navigation.toc[].href` is the raw nav-document-relative string — epubjs never aligns them, which is the root cause of "empty chapter / search misses" books. `EpubBook` resolves both to a canonical zip-relative path (own `resolvePath`, ~20 lines) so matching is deterministic.
- **TOC mapping**: epubjs's nested `toc` → `TocNode` tree (`subitems` → `children`), preserving hierarchy.
- **Content conversion**: each spine document → `EpubBlock[]` via a browser-DOM walker (no turndown on this path — we need element ids for fragment resolution). Images keep the existing epubjs `urlCache` blob-URL resolution (session-lifetime only).
- **Cover**: unchanged `toStableCoverUrl` conversion to a data URL (fixes blob-URL invalidation in `epub-store.ts`).

### 2. Content conversion with source mapping

Each spine item's XHTML is converted once into `EpubBlock[]` (paragraphs, headings, list items, blockquotes, images; ruby stripped; `<a href>` preserved as link formats). The critical addition is **source mapping**, which is what makes locations work:

- every block records `srcElementId` — the `id` of its own element or its nearest ancestor with an `id`;
- every block records `srcCharBase` — the character offset of the block's start within that element's text.

So a TOC entry `part1.xhtml#ch2` resolves to the block whose `srcElementId === 'ch2'` (or, for an anchor on an inline element, the containing block + char offset). This is a mini-CFI over our own block model — no text guessing.

### 3. The book model and locations

```ts
interface BookLocation {
  spineIndex: number;  // position in the spine
  blockIndex: number;  // index into that spine item's EpubBlock[]
  offset: number;      // char offset within the block's text
}
```

All navigation funnels through `resolveHref(href, fromLocation?) → BookLocation`:

- TOC entry click → resolve its `href` (fragment kept);
- internal `<a href="…xhtml#id">` → resolve the same way;
- search result → the location recorded in the index;
- restore → the persisted `lastLocation`.

There is no "load a chapter" anymore. The reader just renders blocks around a location. Prev/next chapter buttons become prev/next TOC entry in document order (flatten the tree), and each jumps via `resolveHref` — so they land on the *actual* start of that TOC entry, not the top of a whole spine document.

### 4. Whole-book pagination

Page breaks are computed over the **global block stream** (all linear spine items in order), not per chapter:

- Extract the existing hidden-measuring-view logic from `ReaderPanel` into a reusable `usePaginatedBlocks` hook.
- The hook keeps: measured block heights (cache in memory), a sorted list of page-start block indices, and the viewport size (`clientWidth`, `clientHeight`, font-size settings from `SettingsContext`).
- Breaks are computed **lazily**: to find the page containing a location, measure forward/backward from the nearest known page start in chunks (double-rAF per chunk, the pattern the reader already uses). Page breaks between spine items are not forced — a page may span a spine boundary, exactly like a real continuous reader.
- On resize/font change: invalidate breaks and heights; recompute lazily from the current location.
- **Total page count**: as built, the header always shows an estimate (`n / ~N`) from a moving chars-per-page average — the planned idle-time full-pagination job for an exact count was not implemented (deferred; see Open questions). Bookshelf progress stays character-based, so it never depends on the viewport.

### 5. Whole-book search

The search index is rebuilt per **spine item** (each exactly once, in spine order), replacing the per-TOC-chapter index:

- Index record per book: `{ version: 2, spineTexts: [{ text, blocks: [{ len, srcElementId }] }] }` stored in IndexedDB (replaces `chapter-texts`).
- Query: lowercase scan of each spine item's text in spine order; up to 30 results; each result carries `{ location, snippet, chapterLabel }`.
- `chapterLabel` = nearest preceding TOC entry in document order (computed during index build), so results show correct chapter context even for untoc'd spine items.
- Navigate: `goToLocation(result.location)` — the paginator jumps to the exact page.
- Build: background, chunked over spine items, cancellable on book close, with a `building…` state in the search tab. Bump the store version so stale indexes rebuild.

### 6. Persistence, progress, migration

- `EpubMeta` replaces `lastChapterHref` / `lastAnchor` / `lastAnchorOffset` with `lastLocation: BookLocation` + `locationFormatVersion: 1`.
- Progress: `readChars` = total plain-text length of all blocks before `lastLocation` + offset; `totalChars` = whole-book plain-text length (both from the same index build — no double counting).
- **Migration**: `epub-store` DB bump to v3. When opening a stored book that has the old fields and no `lastLocation`, resolve `lastChapterHref` (+ fragment) through the new `resolveHref` and persist `lastLocation`, then drop the old fields. Books reparse automatically since we store the raw ArrayBuffer.
- The bookshelf, covers, remove/import flows, and progress bars are unchanged.

**Language scoping**: the bookshelf filters to the current L2 using the L2 the
book was uploaded under — the app does not read the book's OPF language. Books
imported before per-L2 tagging (no stored L2) remain visible in every language
so they never silently disappear; re-importing them under the correct L2
assigns that L2.

**Zip-wrapped EPUBs**: imports accept `.epub.zip` / `.zip` archives that wrap
an EPUB — either the archive is itself an EPUB, it contains a single inner
`.epub`, or it contains an extracted EPUB folder. The wrapper is unwrapped
before parsing.

### 7. Web reader UX changes

- **Sidebar TOC**: renders the `TocNode` tree with real hierarchy and indentation; the current entry is highlighted **including its ancestors** (determined from `lastLocation` → containing TOC branch, not string comparison of hrefs).
- **Header**: current chapter label (nearest preceding TOC entry), page `n / ~N`, progress unchanged; prev/next controls become whole-book page turns (the sidebar keeps prev/next chapter).
- **Search**: same UI, new backend (locations, no duplicates, whole-book coverage).
- **Internal links**: handled inside blocks (link format → `resolveHref` → `goToLocation`), so the global document-level click interceptor (`chapterLinks` hack in `page.tsx`) is deleted.
- **Cover flow**: unchanged, but the cover URL now comes from the epubjs-backed book layer as a stable data URL.
- The markdown-based shared `ReaderPanel` (used by the article web-reader) is untouched; the EPUB reader gets its own block-driven panel built on `usePaginatedBlocks`, keeping per-page tokenization/translation (existing pattern).

## Data structures

```ts
// apps/web/src/lib/epub-book.ts
interface EpubSpineItem {
  index: number;
  idref: string;
  href: string;            // resolved zip path, no fragment
  linear: boolean;
  title?: string;          // nearest preceding TOC label, computed at index time
}

interface TocNode {
  id?: string;
  label: string;
  href: string;            // resolved zip path, fragment STRIPPED
  fragment?: string;       // kept separately; re-attach via fullTocHref()
  children: TocNode[];
}

interface EpubBlock {
  kind: 'text' | 'image';
  type?: 'heading' | 'paragraph' | 'list-item' | 'blockquote';
  depth?: number;
  text?: string;
  formats?: FormatRange[]; // bold/italic/link — link carries the original href
  srcElementId?: string;   // for fragment resolution
  srcCharBase: number;     // char offset of block start in its source element
  imageUri?: string;       // data: URL, resolved against the content doc
}

interface EpubBook {
  title: string;
  author: string;
  spine: EpubSpineItem[];          // reading flow (linear items)
  toc: TocNode[];                  // full hierarchy
  coverUrl: string | null;         // stable data URL
  pageProgressionDir: 'ltr' | 'rtl';
  getBlocks(spineIndex: number): Promise<EpubBlock[]>;
  resolveHref(href: string, baseDir?: string): Promise<BookLocation | null>;
}

// web hook (use-epub.ts → useEpub)
interface BookLocation {
  spineIndex: number;
  blockIndex: number;
  offset: number;
}

interface EpubSearchResult {
  location: BookLocation;
  snippet: string;
  chapterLabel: string;
}
```

Note: the web `TocItem` (`subitems`) and mobile `TocItem` (`children`) converge on the shared `TocNode` (`children`).

## Implementation plan

### Phase A — `EpubBook` book-model layer (web)

1. `apps/web/src/lib/epub-book.ts`: canonical href resolution (spine vs nav-dir), `TocNode` mapping, DOM converter → `EpubBlock[]` with source mapping (element ids + char offsets), `resolveHref`, TOC markers, per-spine plain text, chapter labels.
2. Fixture smoke tests against `tmp/testing-assets/epub/` (Node + jsdom-free: verify canonical spine/TOC matching and conversions with the browser-less DOM unavailable — run the assertions in-browser or with a lightweight DOM shim; see Verification).

### Phase B — swap the web hook to the book model

1. `use-epub.ts` → `useEpub`: `openBook/addBook/removeBook/searchBook` kept; `loadChapter/nextChapter/prevChapter` replaced by `goToLocation`, `nextPage`, `prevPage`, `resolveHref`.
2. `epub-store.ts` v3: `lastLocation` + migration path; search index v2 per spine item.
3. `page.tsx` rewire; delete the document-level link interceptor.

### Phase C — whole-book pagination + reader panel

1. New `use-paginated-book.ts` hook (whole-book paginator; the markdown `ReaderPanel` path is untouched): lazy forward/backward break computation, height cache, viewport invalidation.
2. New `EpubReaderPanel` consuming `EpubBlock[]` from the current location; per-page tokenization + translation (existing caching pattern keyed by global block index).
3. Idle-time full pagination job for the exact total page count — deferred; v1 ships estimate-only (`n / ~N`, see section 4 and Open questions).

### Phase D — search + sidebar

1. `searchBook` over the spine-item index; results carry locations.
2. Sidebar renders `TocNode` hierarchy with ancestor highlighting; prev/next chapter over flattened document order.

### Phase E — cleanup + mobile follow-up

1. No dependency changes on web — `epubjs` and `turndown` stay.
2. Update ARCH-013; add an ADR recording the decision to keep epubjs and layer the book model on top (web) while mobile keeps its hand-rolled parser; mark this spec complete.
3. Follow-up (separate task): evaluate unifying web (epubjs) and mobile (hand-rolled) on one parser — explicitly out of scope here.

## Implementation notes (as-built)

Bugs found and fixed while validating the fixture books; future readers of this
spec should treat these as requirements, not accidents:

1. **Nav/NCX directory canonicalization** — epubjs reports `navPath`/`ncxPath`
   as raw OPF-relative hrefs (`toc.ncx`). `dirname()` of the raw value drops
   the OPF directory, so EPUB-2 books with the NCX beside the OPF (e.g.
   Botchan) ended up with TOC hrefs (`text00002.html`) that never matched
   spine hrefs (`OEBPS/text00002.html`) and every TOC entry resolved to null.
   `resolveNavDir()` resolves the nav href against the OPF dir first.
2. **Fragments are stored, not embedded** — `resolvePath` strips `#fragment`
   from canonical hrefs; the fragment lives on `TocNode.fragment`. Both TOC
   chapter clicks and `tocMarkers()` must resolve via `fullTocHref()` or every
   entry sharing a spine item collapses to block 0 (Botchan: all 11 chapters
   → spine 2 block 0, with the last marker always highlighted).
3. **Measure-container children** — the paginator reads `measureRef.children`
   as one element per block. The hidden measuring container must render blocks
   as direct children; an inner wrapper div makes it measure a single child
   and produce one-block pages.
4. **Paginator generation races** — React dev StrictMode double-invokes the
   reset effect, bumping the fetch generation after `jumpTo` captured it, so
   the only in-flight fetch result is dropped and the spinner never clears.
   Guards: skip the reset when the book instance is unchanged, re-jump when
   the book instance changes, and ref-guard `openBook` against double-clicks.

## Files changed

| File | Change |
|---|---|
| `apps/web/src/lib/epub-book.ts` (new) | Book model on epubjs: canonical hrefs, TOC, converter, locations |
| `apps/web/src/hooks/use-epub.ts` | Rewritten as `useEpub` (book model) |
| `apps/web/src/lib/epub-store.ts` | Schema v3 (`lastLocation`, index v2, migration) |
| `apps/web/src/hooks/use-paginated-book.ts` (new) | Whole-book paginator (markdown `ReaderPanel` untouched) |
| `apps/web/src/components/reader/epub-reader-panel.tsx` (new) | Block-driven, location-based reading pane |
| `apps/web/src/components/reader/epub-chapter-sidebar.tsx` | `TocNode` hierarchy + ancestor highlight |
| `apps/web/src/components/reader/epub-search-panel.tsx` | Location-based results (UX unchanged) |
| `apps/web/src/app/[l1]/[l2]/epub/page.tsx` | New hook wiring, page-level navigation, remove link interceptor |
| `apps/web/package.json` | No change (`epubjs`, `turndown` stay) |
| `docs/arch/013-epub-reader-architecture.md`, `docs/adr/` | Updated/new ADR after implementation |

## Edge cases

- **No TOC / empty nav**: fall back to a flat TOC of spine items; reader still works (locations still resolve to spine starts).
- **TOC entry with a missing fragment id**: resolve to the spine item's first block; never fail the whole navigation.
- **TOC entry pointing outside the spine** (e.g., a resource not in any itemref): treat as un-resolvable and show a disabled entry with a tooltip; log via `[LP Web]` logger.
- **Multi-chapter spine items** (Botchan-style): each TOC entry resolves to its fragment's block — distinct pages, no duplicate content anywhere (pagination, search, progress).
- **`linear="no"` items**: excluded from the main flow and page count; still resolvable via TOC/links (rendered as a standalone page at its spine position).
- **RTL books**: reversed next/prev semantics and mirrored page-order display; full mirroring out of scope.
- **Images**: data URLs resolved against the content doc's directory (fixes blob-URL invalidation and the mobile cover issues tracked in SPEC-012); missing images skipped.
- **Huge books**: index build chunked + cancellable; pagination lazy; token/translation caches bounded to the current page window.
- **Percent-encoded / `..` hrefs, OPF at zip root** (`opfDir` empty — seen in 秘密): normalized by the shared `resolvePath`; fixtures cover both.
- **Duplicate TOC labels or hrefs**: entries stay distinct nodes; locations may coincide — fine.

## Dependencies

- No new dependencies — `epubjs` stays for parsing; `turndown` stays for the article reader.
- ARCH-013 (supersedes), ADR-0012 (web half superseded), SPEC-012 (image pipeline aligns), SPEC-009 (reader layout).
- New translation keys (all 31 locales, via `scripts/add-translation-key.mjs`): `msg.page_of` ("Page {current} of {total}"), `msg.building_book_index` ("Building book index…"), `msg.jump_to_chapter` (if a "jump to chapter" affordance is added).

## Open questions

1. **Converter host** — the browser-DOM walker used by `EpubBook` works in the browser only; keep it web-local (mobile's regex pipeline stays as-is).
2. **Non-linear items** — include in the flow vs standalone-only; v1 default is standalone-only, but a book with *only* non-linear content should fall back to including them.
3. **Total page count** — resolved for v1: estimate-only (`n / ~N`) via chars-per-page average; an exact idle-time full-pagination job remains a possible follow-up.
4. **RTL scope** — reversed arrows only (v1) vs full mirrored pagination; confirm this matches user expectations for Japanese/Chinese books that are LTR anyway.

## Verification plan

Run against the fixtures in `tmp/testing-assets/epub/`:

- **Invariants**: every linear spine item appears exactly once in the flow; every TOC entry resolves to a `BookLocation`; total plain-text chars are monotonic across locations.
- **Botchan regression**: the 10 fragment-shared TOC entries land on 10 distinct positions (previously identical content); search for a chapter title returns no duplicates; `totalChars` matches single-pass text length.
- **Snow Country / Midnight Sun**: search finds strings inside untoc'd spine items (previously missed).
- **Engels**: TOC renders 3 levels deep; ancestor highlighting works at depth 3.
- **Restore**: open, read to a mid-spine fragment, close, reopen — lands on the same block/offset without any text-anchor seek.
- **Pagination**: page count continuous across spine boundaries; resize invalidates and recomputes without jumping away from the current block.
- Type-check web (`cd apps/web && ./node_modules/.bin/tsc --noEmit`) and the new package before merging.
