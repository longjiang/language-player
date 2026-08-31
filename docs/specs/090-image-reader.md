# SPEC-090: Image Reader

## Metadata
- **Spec ID**: SPEC-090
- **Feature**: Standalone image reader — OCR images via DeepSeek Vision into tokenized, interactive text (web + mobile)
- **Status**: implemented (retroactive spec for the as-built feature; see SPEC-089 for the original PDF & Image Reader work)
- **ROADMAP Phase**: Phase 5 (Content Features) — Reading
- **See also**: [SPEC-089 — PDF & Image Reader](089-pdf-and-image-reader.md), [SPEC-083 — Unified Markdown](083-mobile-unified-markdown.md), [ARCH-013 — EPUB Reader Architecture](../arch/013-epub-reader-architecture.md), [ADR-0012](../adr/0012-custom-epub-parser-mobile.md), [ADR-0022](../adr/0022-epub-web-book-model-on-epubjs.md)

## Overview

The image reader is a standalone route reachable from the Reading menu. Users
load one or more images (file picker, drag & drop, or clipboard paste; the OS
file-open entry point is **unimplemented** — see below); each is OCR'd by
DeepSeek Vision and shown as **tokenized, interactive text** in the shared
paginated reader, with a thumbnail sidebar for multi-image navigation. It is
**not** an action inside the epub reader.

## Routes & files

- **Web**: `/[l1]/[l2]/image-reader` — `apps/web/src/app/[l1]/[l2]/image-reader/{page,layout}.tsx`
- **Mobile**: `(tabs)/(reading)/image-reader` — `apps/mobile/app/(tabs)/(reading)/image-reader.tsx`
  (registered in the reading `Stack`; an "Image Reader" item was added to the
  Reading menu in `NavBar.tsx` and `HamburgerDrawer.tsx`).
- Reading-menu key: `title.image_reader`.

## Vision pipeline

1. **Downscale** the image before `POST /vision` to cap token usage and
   latency:
   - **Web**: `apps/web/src/lib/downscale-image.ts` (browser `Image` + canvas).
   - **Mobile**: `apps/mobile/lib/downscale-image.ts` via `expo-image-manipulator`.
   - Longest side capped at `IMAGE_OCR_MAX_DIM` (1600px) and re-encoded to JPEG
     `IMAGE_OCR_QUALITY` (0.9); web preserves PNG for transparent images. The
     thumbnail and preview still use the full-resolution original — only the
     copy sent for OCR is downscaled.
2. **`POST /vision`** (`deepseek-v4-flash-vision-exp`), cached server-side by
   prompt + image bytes.
3. **OCR prompt** requests clean markdown in the original language that emits
   **only** the text literally present in the image and reflows like normal
   reading while preserving structure. Each logical element (a paragraph, a
   sentence, a receipt/list/menu row, a table row, a caption, or a speech
   bubble) is emitted as **one continuous line** (its wrapped image rows
   merged), and distinct elements are separated by a blank line. The model
   must not add any other text — no intro, summary, description, translation,
   guesses about blurry/cut-off text, page/panel numbers, panel/sound-effect
   labels, or a code fence wrapper. (Verified against `/vision`: the model
   keeps blank-line-separated blocks and does not collapse the whole page into
   one block.) The previous prompt emitted soft line breaks (`\n`) inside a
   block and relied on the reader to collapse them: the web reader does (HTML
   `white-space: normal`) but the mobile reader (React Native `<Text>`, which
   renders `block.text` directly) **preserves** `\n` as a hard line break, so
   sentences fragmented on mobile instead of reflowing. One continuous line
   per element reflows identically on both, so the reader needs no
   post-processing.
4. The reader **opportunistically** pulls a leading `# <title>` heading out as
   the image title (web `extractTitle`; used for the title bar and the
   saved-word context). The prompt asks for a `# <title>` line **only when the
   image has an obvious document title**; otherwise it emits none and the
   title falls back to the filename. The body is then parsed into reader
   blocks (web `parseMarkdown`; mobile `useEpubPagination`, whose
   `parseMarkdownBlocks` shim keeps OCR image/PDF markdown's blank-line-
   separated blocks intact).
5. OCR is **lazy per image**; the first pasted/dropped/picked image is opened
   by default and OCR'd immediately.

## Entry surfaces

- **Multi-file** drag & drop (web) or **multi-file picker** (web + mobile
  `DocumentPicker`).
- **Paste** button + global **Ctrl/Cmd+V** clipboard-image paste: web `paste`
  event / `navigator.clipboard.read()`; mobile `expo-clipboard` `getImageAsync`.
- **OS file-open** routing — **unimplemented / removed.** Previously the mobile
  `lib/file-open.ts` sent OS-opened images here (consumed on focus), but the
  OS file-open feature was **discarded** because a Release build black-screens
  at launch (`[runtime not ready]: TypeError: Cannot read property 'timeout' of
  undefined`; no crash report; Debug unaffected). Users load images via the
  picker / paste / drop instead.

## Sidebar

- Right-side, **collapsible** standard `Sidebar` (web `components/ui/sidebar`;
  mobile `components/ui/sidebar` + `useSidebar`): a desktop persistent panel +
  a mobile slide-in sheet.
- Thumbnail list: a **single centered column of large thumbnails** with 16px
  inner padding, **current image highlighted**. Clicking a non-current
  thumbnail selects it; clicking the **current** thumbnail opens the preview.
- Below the last thumbnail, a dashed **"add next image"** tile holding
  **Select files** and **Paste** buttons.
- Title bar: title (LLM title → file name) + sidebar toggle + close. There is
  **no** back arrow and no select/paste in the title bar (those live in the
  sidebar).

## Preview & zoom

Clicking the current image thumbnail opens a **full-size preview**:

- **Web**: Radix `Dialog` + a `ZoomableImage` — click toggles zoom (1× ↔ 2×),
  Ctrl+wheel / trackpad pinch zooms continuously, drag pans while zoomed.
- **Mobile**: `Modal` + a `ZoomableImage` using `react-native-gesture-handler`
  (`Gesture.Tap` + `Gesture.Pinch` + `Gesture.Pan`, `.runOnJS`), wrapped in a
  `GestureHandlerRootView` for the modal window — tap toggles zoom, pinch
  zooms, drag pans.

## Persistence

The gallery survives navigating away or a refresh/restart:

- **Web**: IndexedDB — `apps/web/src/lib/image-reader-store.ts`.
- **Mobile**: a JSON file in the app documents —
  `apps/mobile/lib/image-reader-store.ts`.

It saves each image's base64 + OCR result + title and the current selection,
and restores them on mount. Images without a stored result are re-OCR'd lazily.

## Saved-word context

The image title (LLM title → file name) is used as `SavedWordContext.textTitle`
on web, so saved words carry proper context instead of a raw filename.

## Cache

Vision results are cached server-side by `/vision` (keyed by prompt + image
bytes), so re-opening an image is instant and free.

## i18n

Keys: `title.image_reader`, `msg.drop_images_here`, `msg.image_reader_supported`,
`msg.image_reader_empty`, `msg.image_reader_ocr_error`,
`msg.no_image_in_clipboard`, `action.select_files`, `action.paste`. (All locales.)

## Logging

Gated: web `epubLog` (flip `EPUB_LOGS_ENABLED`), mobile `log` / `logwarn`
(app-wide `LOG_LEVEL`). Logs the **exact prompt sent** to `/vision` and the
**full markdown response** (in addition to its length, the extracted title,
and the downscaled payload byte size), so OCR reflow/accuracy issues can be
confirmed directly from the logs.

## Verification

- Load images via picker / drop / paste (OS file-open is unimplemented) →
  thumbnails appear, the current one opens and OCRs.
- Title bar shows the human-readable title; saved-word context uses it.
- Sidebar collapses on desktop / sheets on mobile; the add-next tile adds
  images.
- Preview opens on clicking the current thumbnail; click/pinch zoom + drag pan.
- Gallery persists across navigation/refresh (web + mobile).
- Typecheck both apps (`apps/web`, `apps/mobile`).

## Revision

- **Retroactive spec**: written to describe the as-built standalone image
  reader (routes, entry surfaces, vision pipeline incl. downscaling, LLM title,
  block-breaking, sidebar, preview/zoom, persistence, i18n, logging). Supersedes
  the image-reader notes previously folded into SPEC-089.
- **Reflow, no line fragmentation**: the OCR text now reflows instead of
  rendering one block per visual line. The model already emits
  blank-line-separated paragraphs with soft-wrap lines, so the reader keeps a
  block's soft breaks inside one paragraph (mobile `parse-markdown.ts` only
  folds single `\n` for genuinely flat plain text) and the unused
  `normalizeVisionMarkdown` force-split (which split every OCR line into its
  own block) was removed.
- **Log prompt + full response**: the image-reader OCR path logs the exact
  prompt sent to `/vision` and the complete markdown returned (plus length,
  title, and payload size).
- **Prompt wording (no extra text + cross-platform reflow)**: the shared
  `IMAGE_OCR_PROMPT` (packages/shared/src/markdown/vision.ts) was tightened.
  It now (a) forbids any text beyond the image's own words — no intro,
  summary, description, translation, guesses about blurry/cut-off text,
  page/panel numbers, panel/sound-effect labels, or a code fence wrapper
  (previously the model could add e.g. a parenthetical "(or something
  similar, cut off at bottom)" on a receipt or per-panel/labels annotations
  on a manga); and (b) reflows each element (paragraph, sentence,
  receipt/list/menu row, caption, speech bubble) into **one continuous line**
  with blank lines between elements, so a sentence that wraps across several
  image rows renders as one line and reflows on both web and mobile. This
  replaces the earlier "soft line breaks inside a block + the reader collapses
  them" strategy, which reflowed on web but fragmented on mobile because the
  React Native reader preserves `\n`. Downscale quality constant was
  `IMAGE_OCR_QUALITY = 0.9` (was documented as 0.82).
