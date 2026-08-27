# SPEC-089: PDF & Image Reader

## Metadata
- **Spec ID**: SPEC-089
- **Feature**: PDF bookshelf entries (cover, thumbnails, AI page→markdown, TOC/thumbnails buttons) and the image reader (vision OCR) — web + mobile
- **Status**: implemented (2026-08-25; web `dbc39d9d`, mobile `64745e95`, image `53cf12e1`)
- **ROADMAP Phase**: Phase 5 (Content Features) — Reading
- **See also**: [SPEC-090 — Image Reader](090-image-reader.md), [EPUB Reader Architecture](../arch/013-epub-reader-architecture.md), [SPEC-087 — Paginated Reader](087-paginated-reader.md), [SPEC-085 — EBook Reader Interface](085-ebook-reader-interface.md)

## Overview

The ebook reader (bookshelf + paginated reader) gains two content types:

1. **PDFs** sit on the bookshelf like EPUBs:
   - the **first page** is rendered at import as the shelf cover;
   - opening a PDF **auto-opens page 1** in the paginated reader (converted
     via DeepSeek Vision) with a **collapsible right-side thumbnails sidebar**
     (standard Sidebar — desktop persistent panel / mobile slide-in sheet);
   - the sidebar lists every page, **outlines the current page**, tapping a
     different page opens it, and tapping the **current** page opens a
     **full-size zoomable preview modal** (same as the image reader);
   - the reader's **bottom bar** has a **TOC button** (the PDF outline) and a
     **Thumbnails button** (toggles the sidebar).
2. **Images** open into the standalone image reader: OCR via DeepSeek Vision
   (`deepseek-v4-flash-vision-exp`, `POST /vision`, cached) → markdown →
   paginated reader.

## Image reader (standalone)

The image reader is its own **route** reachable from the Reading menu, not an
action inside the epub reader:

- **Web**: `/[l1]/[l2]/image-reader` (`apps/web/src/app/[l1]/[l2]/image-reader/`)
- **Mobile**: `(tabs)/(reading)/image-reader` (`apps/mobile/app/(tabs)/(reading)/image-reader.tsx`)

It provides a **multi-file** entry surface (drag & drop or a multi-file picker),
a **paste** button, and global **Ctrl/Cmd+V** clipboard-image paste (web
`paste` event; mobile `expo-clipboard` `getImageAsync`). Once files are
loaded the vision-OCR result of the current image is shown as **tokenized
text** in the paginated reader, with a **thumbnail sidebar on the right**
(current image highlighted) that is **collapsible** like every other standard
sidebar (desktop persistent panel + mobile slide-in sheet). Below the last
thumbnail the sidebar shows a dashed **"add next image"** tile with
"Select files" and "Paste" buttons. OCR is lazy per selection; results are
cached server-side. The first pasted/dropped/picked image is opened by
default and OCR'd immediately. The title bar no longer carries a back arrow
or the select/paste actions (they moved into the sidebar).

Clicking the **current** image thumbnail opens a **full-size preview dialog**;
clicking the image toggles zoom (1× ↔ 2×), pinch (mobile) / Ctrl+wheel
(trackpad pinch, web) zooms continuously, and dragging pans while zoomed.
Clicking a *different* thumbnail selects it instead.

The gallery persists across navigation/refresh and is restored on mount:
- **Web**: IndexedDB (`apps/web/src/lib/image-reader-store.ts`).
- **Mobile**: a JSON file in the app documents
  (`apps/mobile/lib/image-reader-store.ts`).
Images are re-OCR'd lazily if they have no stored result (the `/vision`
results are cached server-side).

The vision model is prompted to return **clean, flowing markdown** in
**natural reading order**: the text with wrapped lines joined into flowing
prose (no hard line breaks inside a paragraph, no sentence split across
separate lines). The image reader additionally asks for a leading
`# <title>` heading giving a short, human-readable image title (which the
reader extracts and uses for the title bar and the saved-word context — not
the raw filename). That makes the reader break blocks naturally and reflow
each block independently — there is **no** client-side post-processing of the
OCR text. The PDF page→markdown path uses the same simplified style (minus
the title heading).

> **Full detail moved to [SPEC-090 — Image Reader](090-image-reader.md).** This
> section is a summary; the standalone image reader (routes, entry surfaces,
> vision pipeline incl. downscaling, sidebar, preview/zoom, persistence) is
> documented there.

## Architecture

| | Web | Mobile |
|---|---|---|
| PDF rendering | `pdfjs-dist` (client, canvas) | pdf.js ESM + worker inside a hidden `react-native-webview` (data: URLs) — no native modules |
| Shelf meta | `EpubMeta.format: 'epub' \| 'pdf'` (IndexedDB) | same field (`epub-store.ts`, FileSystem) |
| AI page→markdown | `pdfPageToMarkdown()` → `POST /vision` (page image, "extract as markdown" prompt) | same endpoint; page image from `PdfViewer.renderPage(page, 1.5)` |
| TOC | pdf.js outline (dest→page) | pdf.js outline in the WebView, posted back |
| Reader panel | `components/reader/pdf-reader-panel.tsx` | `components/reader/PdfReaderPanel.tsx` |
| Bottom bar | `PaginatedReader.onOpenToc` + new `onOpenThumbnails` | same |

### Image reader flow
`Open image` (Reading menu → Image Reader) → paste/drop/pick one or more
images → `POST /vision` (OCR prompt requesting block-level markdown) →
`parseMarkdown` / `parseMarkdownBlocks` → shared paginated reader
(non-immersive session), with a thumbnail rail for multi-image navigation.
The first pasted/dropped/picked image is opened by default and OCR'd
immediately.

## Caching

Vision results are cached server-side by `/vision` (keyed by prompt + image
bytes), so re-opening a PDF page or image is instant and free. The mobile
PDF thumbnails and the rendered cover are cached locally in the app.

## Verification

- Import a PDF → shelf tile shows page 1; open → page 1 is read with a
  right-side thumbnails sidebar; switching pages, the current-page outline,
  the full-page preview modal, and the TOC + Thumbnails-toggle buttons work
  (web + mobile).
- Open an image → OCR text appears in the paginated reader.
- Typecheck both apps (`apps/web`, `apps/mobile`); runtime verification of
  the mobile WebView pdf.js path and OS file-open is outstanding (needs a
  simulator/device run).

## Revision

- **Image reader → standalone route**: the image reader moved out of the epub
  reader's bookshelf "Open image" action into its own route
  (`/[l1]/[l2]/image-reader` web, `(tabs)/(reading)/image-reader` mobile) with
  an "Image Reader" item in the Reading menu. It now supports multi-file
  drag & drop / picker, clipboard-image paste (Ctrl/Cmd+V), and a thumbnail
  rail; the epub reader no longer hosts an inline image session. The first
  pasted/dropped image is opened by default and OCR'd immediately.
- **Block breaking via the prompt (reversed earlier post-processing)**: block
  breaking is now driven by the vision OCR prompt, which requests properly
  formatted, block-level markdown (blocks separated by blank lines, each
  paragraph as flowing prose). This replaces an earlier client-side
  `normalizeVisionMarkdown` step that force-split every OCR line into its own
  block, which caused text to render pre-wrapped instead of reflowing.
- **PDF reader: thumbnails sidebar replaces the grid**: the PDF reader no
  longer opens onto a page-thumbnails grid. It auto-opens page 1 with a
  collapsible right-side thumbnails sidebar (current page outlined; tapping
  the current page opens a full-size zoomable preview modal; the bottom-bar
  Thumbnails button toggles the sidebar). The top-right reader close control
  is now a `✕` close button, and the top-left thumbnails icon was removed in
  favour of a standard sidebar toggle (see also ARCH-013).
- **Simplified vision prompt**: the vision OCR prompt was simplified — the
  model is asked to read in natural reading order and join wrapped lines into
  flowing prose (no fixed-width line breaks), rather than an explicit
  block-splitting instruction list.
