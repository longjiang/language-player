# SPEC-089: PDF & Image Reader

## Metadata
- **Spec ID**: SPEC-089
- **Feature**: PDF bookshelf entries (cover, thumbnails, AI page→markdown, TOC/thumbnails buttons) and the image reader (vision OCR) — web + mobile
- **Status**: implemented (2026-08-25; web `dbc39d9d`, mobile `64745e95`, image `53cf12e1`)
- **ROADMAP Phase**: Phase 5 (Content Features) — Reading
- **See also**: [EPUB Reader Architecture](../arch/013-epub-reader-architecture.md), [SPEC-087 — Paginated Reader](087-paginated-reader.md), [SPEC-085 — EBook Reader Interface](085-ebook-reader-interface.md)

## Overview

The ebook reader (bookshelf + paginated reader) gains two content types:

1. **PDFs** sit on the bookshelf like EPUBs:
   - the **first page** is rendered at import as the shelf cover;
   - opening a PDF shows a **grid of page thumbnails**;
   - tapping a page **converts it to markdown via AI** (DeepSeek Vision) and
     loads it into the paginated reader (tokenized words + translation);
   - the reader's **bottom bar** has a **TOC button** (the PDF outline) and a
     **Thumbnails button** (back to the grid).
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
loaded it shows a **thumbnail rail/sidebar** (current image highlighted) and
the vision-OCR result of the current image as **tokenized text** in the
paginated reader. OCR is lazy per selection; results are cached server-side.

The OCR markdown is normalized by `normalizeVisionMarkdown`
(`packages/shared/src/markdown/vision.ts`) so paragraphs the vision model
returns separated by single newlines become separate reader blocks (the model
often collapses them into one paragraph/block otherwise). This also benefits
the PDF page→markdown path.

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
images → `POST /vision` (OCR prompt) → `normalizeVisionMarkdown` →
`parseMarkdown` / `parseMarkdownBlocks` → shared paginated reader
(non-immersive session), with a thumbnail rail for multi-image navigation.

## Caching

Vision results are cached server-side by `/vision` (keyed by prompt + image
bytes), so re-opening a PDF page or image is instant and free. The mobile
PDF thumbnails and the rendered cover are cached locally in the app.

## Verification

- Import a PDF → shelf tile shows page 1; open → thumbnails grid; tap a page
  → markdown reader; TOC + Thumbnails buttons work (web + mobile).
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
  rail; the epub reader no longer hosts an inline image session. OCR markdown
  is normalized by `normalizeVisionMarkdown` for block breaking.
