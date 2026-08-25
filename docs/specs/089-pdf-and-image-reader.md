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
2. **Images** open into the image reader: OCR via DeepSeek Vision
   (`deepseek-v4-flash-vision-exp`, `POST /vision`, cached) → markdown →
   paginated reader.

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
`Open image` → image → `POST /vision` (OCR prompt) → `parseMarkdown` /
`parseMarkdownBlocks` → shared paginated reader (non-immersive session).

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
