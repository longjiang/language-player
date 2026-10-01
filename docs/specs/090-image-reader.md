# SPEC-090: Image Reader

## Metadata
- **Spec ID**: SPEC-090
- **Feature**: Standalone image reader — OCR images via DeepSeek Vision into tokenized, interactive text (web + mobile)
- **Status**: implemented on **web**; **mobile is partial** (retroactive spec for the as-built feature; see SPEC-089 for the original PDF & Image Reader work). The mobile route and vision pipeline exist, but two described pieces were never built — see the **Preview & zoom** and **Persistence** sections below.
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
   - Longest side capped at `IMAGE_OCR_MAX_DIM` (1600px); PNG sources are kept
     lossless PNG (sharp text, preserved alpha) and photographic JPEG sources
     are re-encoded at `IMAGE_OCR_QUALITY` (0.9); web preserves PNG for
     transparent images. The thumbnail and preview still use the
     full-resolution original — only the copy sent for OCR is downscaled.
   - **Payload budget (mobile).** The production front end drops a request body
     of roughly **2.5 MiB or more**: a `/vision` POST that big answers
     `400 {"message":"Missing image (base64 data URL)"}` because the truncated
     body never parses as JSON — while a local Flask server accepts the same
     request at any size. A full-resolution PNG screenshot exceeds that, which
     is why OCR worked in Debug (localhost) and silently produced a blank
     reader in Release (production) for large images. The mobile encoder
     therefore steps down until the encoded data URL is under
     `IMAGE_OCR_MAX_PAYLOAD_BYTES` (2 MB): preferred encoding at the cap →
     same size as JPEG → progressively smaller JPEGs (×0.75) down to
     `IMAGE_OCR_MIN_DIM` (800px) → JPEG at `IMAGE_OCR_FLOOR_QUALITY` (0.6). If
     nothing fits, the smallest payload produced is sent anyway. Longest side,
     format and byte size of every attempt are logged.
2. **`POST /vision`** (`deepseek-v4-flash-vision-exp`), cached server-side by
   prompt + image bytes. The request is aborted after 90s (`OCR_TIMEOUT_MS`) so
   the spinner can never hang forever.
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

- **Multi-file** drag & drop (web) or **multi-file picker** (web + mobile).
  Every "**Select images**" button (web: empty-state drop zone + sidebar
  "add next image" tile; mobile: empty state + reader header) opens the OS file
  browser on web, and on mobile a **source menu** with the same three choices a
  Safari file input offers: **Take Photo** (`expo-image-picker`
  `launchCameraAsync`), **Photo Library** (`launchImageLibraryAsync`), and
  **Choose Files** (`expo-document-picker`). The photo-library picker is the
  system one — no permission prompt (PHPicker on iOS 14+, the Android photo
  picker on 13+); the camera asks for camera access and shows
  `msg.camera_permission_denied` when it is refused. Photos only: the
  `expo-image-picker` plugin is configured with `microphonePermission: false`,
  so no RECORD_AUDIO / NSMicrophoneUsageDescription is added.
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
  **Select images** and **Paste** buttons.
- Title bar: title (LLM title → file name) + sidebar toggle + close. There is
  **no** back arrow and no select/paste in the title bar (those live in the
  sidebar).

## Preview & zoom

Clicking the current image thumbnail opens a **full-size preview**:

- **Web**: Radix `Dialog` + a `ZoomableImage` — click toggles zoom (1× ↔ 2×),
  Ctrl+wheel / trackpad pinch zooms continuously, drag pans while zoomed.
- **Mobile**: **not built.** There is no `ZoomableImage` and no pinch-zoom component anywhere in `apps/mobile/components` or `apps/mobile/app`. A mobile full-size preview with tap/pinch/pan gestures was specified but never implemented, so mobile currently has no zoom on the loaded image.

## Persistence

The gallery survives navigating away or a refresh/restart — **on web only** (see the mobile note below):

- **Web**: IndexedDB — `apps/web/src/lib/image-reader-store.ts`.
- **Mobile**: **not persisted.** `apps/mobile/lib/image-reader-store.ts` does not exist; the mobile gallery lives in component `useState` (`apps/mobile/app/(tabs)/(reading)/image-reader.tsx:79–80`) and is **lost on restart**.

The paragraph below describes the **web** store only; mobile has no equivalent, so the "survives a restart" behaviour does not hold there.

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
`msg.no_image_in_clipboard`, `action.select_images`, `action.paste`. (All locales.)

Mobile-only keys (the source menu): `action.take_photo`,
`action.photo_library`, `action.choose_files`, and
`msg.camera_permission_denied`. `action.select_files` ("Select files") is the
previous label for the same buttons — it stays in the CSV but the image readers
no longer use it.

The in-progress spinner uses `msg.recognizing_text` ("Recognizing text…") on all
three vision-OCR call sites — mobile image reader, web image reader, and the web
PDF page→markdown panel — because that is what is actually happening while the
model reads the image. (`msg.making_words_interactive`, "Making words
interactive…", is the older wording; it is no longer used by the OCR spinners
but is kept in the CSV.)

The OCR failure state renders `msg.image_reader_ocr_error` plus an
**untranslated** diagnostic line (`detail`): `HTTP <status> — <server message>`,
the caught error message, or a timeout notice. That line exists so a
Release-build failure can be reported from a screenshot without a device-console
capture.

## Logging

Gated: web `epubLog` (flip `EPUB_LOGS_ENABLED`), mobile `log` / `logwarn` /
`logerr` (app-wide `LOG_LEVEL`). Logs the **exact prompt sent** to `/vision` and
the **full markdown response** (in addition to its length, the extracted title,
and the downscaled payload byte size), so OCR reflow/accuracy issues can be
confirmed directly from the logs.

For request failures the mobile path logs on the **error channel** — which
prints in a Release build, where `LOG_LEVEL` defaults to 1 — the resolved
`PYTHON_API_URL`, the encoded payload size, the HTTP status, the server's
`message`, and the first 300 bytes of the body. Each payload-ladder attempt
(size, format, quality, byte count, budget) is logged on the info channel.

## Verification

- Load images via picker / drop / paste (OS file-open is unimplemented) →
  thumbnails appear, the first new image opens **and starts OCR immediately**
  (no thumbnail tap needed), and blocks render in the paginated reader.
- The in-progress indicator reads "Recognizing text…".
- A failed `/vision` call (HTTP error, empty response, or timeout) shows
  `msg.image_reader_ocr_error` plus the diagnostic detail — never a blank
  reader.
- Title bar shows the human-readable title; saved-word context uses it.
- Sidebar collapses on desktop / sheets on mobile; the add-next tile adds
  images.
- Preview opens on clicking the current thumbnail; click/pinch zoom + drag pan.
- Gallery persists across navigation/refresh (web + mobile).
- Typecheck both apps (`apps/web`, `apps/mobile`).

## Revision

- **OCR starts on paste/pick; failures are reported (2026-10-01)**: three bugs
  fixed together. (1) `append` called `runOcr` with only an id, and the lookup
  went through `imagesRef`, which only catches up with `setImages` on the next
  render — so the immediate OCR no-op'd and the image sat unread until the user
  tapped its thumbnail; `runOcr` now takes the entry from the caller and an
  in-flight set prevents a duplicate request from a fast tap. (2) A non-OK
  `/vision` response was swallowed (`res.ok ? … : null` → empty markdown) and
  left a **blank reader with no error**, which is how the mobile Release-only
  failure presented; non-OK/empty responses now set the error state with an
  HTTP status + server-message detail, the request is aborted after 90s, and
  the failure is logged on the error channel (visible in Release, where the log
  level defaults to 1). (3) **Release-only OCR failure root cause**: the
  production front end drops a request body of ~2.5 MiB or more — a `/vision`
  POST that big returns `400 Missing image (base64 data URL)` because the
  truncated body never parses as JSON — while the Debug build's localhost Flask
  accepts any size. Mobile's lossless-PNG-for-text encoding at 1600px can
  exceed that, so the mobile encoder now enforces
  `IMAGE_OCR_MAX_PAYLOAD_BYTES` (see § Vision pipeline). Verified by direct
  request against production (2.54 MB body → 500 from the model; 2.62 MB body →
  `400 Missing image`; the same 2.62 MB body against local Flask → parsed
  normally).
- **Spinner wording**: the vision-OCR spinner now says `msg.recognizing_text`
  ("Recognizing text…") instead of `msg.making_words_interactive` ("Making words
  interactive…") on all three call sites (mobile image reader, web image
  reader, web PDF panel).
- **"Select images" + a mobile source menu (2026-10-01)**: the buttons that load
  images are labelled `action.select_images` ("Select images") on web (empty
  state + sidebar add-next tile) and mobile (empty state + reader header) — they
  only ever accepted images. On mobile the button now opens a source menu
  (`ContextMenu`, given a labelled custom trigger via the new `trigger` prop)
  with Take Photo / Photo Library / Choose Files, the three choices a Safari
  file input offers. This adds the native module `expo-image-picker` (with
  `microphonePermission: false`) plus `NSCameraUsageDescription` /
  `NSPhotoLibraryUsageDescription`, so the mobile app needs a **native rebuild**
  — `pod install` then `scripts/dev-build.mjs ios-device` for a dev build, and a
  normal archive for a store build. `mimeFor()` no longer reports a HEIC file as
  `image/webp`, and picker assets use the `mimeType` the system reports.
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
