# SPEC-012: EPUB Image Rendering (Mobile)

## Metadata
- **Spec ID**: SPEC-012
- **Feature**: Render inline images from EPUB content documents on mobile
- **Status**: in-progress (inline images: implemented; cover image: unresolved — 4 attempts, see Implementation Attempts)
- **Created**: 2025-07-25
- **ROADMAP Phase**: Phase 4 (Reading)
- **See also**: [EPUB Reader Architecture](../arch/013-epub-reader-architecture.md)

## Overview

The mobile EPUB reader currently strips all HTML tags including `<img>`, producing text-only output. This spec describes how to extract, cache, and render inline images from EPUB content documents using React Native's `<Image>` component, bringing the mobile reader to feature parity with the web reader's image support.

## User Stories

- As a reader, I want to see illustrations, diagrams, and photos embedded in my EPUB books so that I can understand visual content alongside text.
- As a language learner, I want images to appear in context between paragraphs so that visual cues help with reading comprehension.

## Current State

### What works
- Cover images are already extracted and displayed (`coverUrl` in `use-epub.ts`, line 163–165)
- The OPF manifest parser (`epub-parser.ts`) already iterates all `<item>` elements and can identify `media-type` attributes
- `JSZip` can extract any file as base64 via `zip.file(path).async('base64')`
- React Native `<Image>` renders `data:` URIs natively

### What's missing
- Manifest image items are not collected into a cache
- `loadChapterContent` regex-strips `<img>` tags before they can be resolved
- No `ImageBlock` type exists in `parse-markdown.ts`
- No image rendering path exists in `epub.tsx`
- The measuring view and page-break algorithm don't account for image heights

## Design

### Data Flow

```
loadFromUri()
  │
  ├─ Parse OPF manifest → identify image items
  │     media-type="image/jpeg|image/png|image/gif|image/svg+xml|image/webp"
  │
  ├─ For each image item:
  │     resolvedPath = resolvePath(opfDir, item.href)
  │     base64 = zip.file(resolvedPath).async('base64')
  │     imageCache.set(resolvedPath, `data:${mediaType};base64,${base64}`)
  │
  └─ imageCache stored in useRef<Map<string, string>>
  │
  ▼
loadChapter(href)
  │
  ├─ loadChapterContent(spineItem.href) → HTML
  │     Before stripping tags:
  │       1. Find <img src="..." /> tags
  │       2. Resolve src against content doc's directory
  │       3. Look up in imageCache → replace with [IMG:dataUri] marker
  │       4. Strip remaining HTML tags as before
  │
  └─ Return text with [IMG:...] markers in original positions
  │
  ▼
parseMarkdownBlocks(text)
  │
  ├─ Split text on [IMG:...] markers before markdown parsing
  ├─ For text segments: parse as markdown → TextBlock[]
  ├─ For image markers: emit ImageBlock { kind: 'image', uri: string }
  └─ Return interleaved array: [TextBlock, ImageBlock, TextBlock, ...]
  │
  ▼
epub.tsx
  │
  ├─ Measuring view: render <Image> for ImageBlocks with onLayout
  │     → measure natural height within max-width constraint
  │
  ├─ Page break: accumulate image heights same as text block heights
  │
  └─ Visible view: render <Image> with cache data URI, max-width constraint
```

### New Type: `ContentBlock`

```typescript
// In parse-markdown.ts — union of text and image blocks
type ContentBlock = TextBlock | ImageBlock;

interface TextBlock {
  kind: 'text';
  type: 'heading' | 'paragraph' | 'list-item' | 'blockquote';
  depth?: number;
  text: string;
}

interface ImageBlock {
  kind: 'image';
  uri: string;  // data: URI
  width?: number;
  height?: number;
}
```

### Image Marker Format

Images are injected into the text stream as fixed-format markers before markdown parsing:

```
[IMG:data:image/jpeg;base64,/9j/4AAQSkZJRg...]
```

The marker is a single line with no surrounding whitespace. `parseMarkdownBlocks` splits the input string on this marker pattern, parses text segments as markdown, and emits `ImageBlock`s for each marker.

### Image Resolution

When processing `<img>` tags in `loadChapterContent`, the `src` attribute must be resolved relative to the **content document's directory**, not the OPF directory. For example, if the content doc is at `OEBPS/Text/chapter1.xhtml` and references `../Images/fig1.jpg`, the resolved path is `OEBPS/Images/fig1.jpg`.

```typescript
function resolveImagePath(contentDocHref: string, imgSrc: string): string {
  const contentDir = contentDocHref.substring(0, contentDocHref.lastIndexOf('/') + 1);
  return resolvePath(contentDir, imgSrc);
}
```

### Image Cache

Built once at load time in `loadFromUri`:

```typescript
const imageCacheRef = useRef<Map<string, string>>(new Map());

// In loadFromUri, after manifest parsing:
const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/svg+xml', 'image/webp'];

for (const [, item] of manifestItems) {
  const mediaType = item.mediaType; // need to capture this from manifest parsing
  if (mediaType && IMAGE_MIME_TYPES.includes(mediaType)) {
    const resolvedPath = resolvePathFn(opfDir, item.href);
    const file = zip.file(resolvedPath);
    if (file) {
      const base64 = await file.async('base64');
      imageCacheRef.current.set(resolvedPath, `data:${mediaType};base64,${base64}`);
    }
  }
}
```

**Optimization:** Defer image extraction to on-demand (first access) if there are many images. Simpler to extract all eagerly for now — typical EPUBs have < 50 images.

### Measuring View Integration

The hidden measuring view currently renders all blocks with `opacity: 0` to get their heights. For `ImageBlock`s, render a `<Image>` with:

```tsx
<Image
  source={{ uri: block.uri }}
  style={{ width: maxWidth, height: undefined }}
  resizeMode="contain"
  onLayout={(e) => handleMeasureBlock(blockIndex, e.nativeEvent.layout.height)}
/>
```

RN's `<Image>` with `width` set and `height: undefined` will scale to the natural aspect ratio. The `onLayout` event provides the rendered height.

**Caveat:** Images may not render at full native resolution due to the max-width constraint. Use `resizeMode="contain"` to preserve aspect ratio within the available width.

### Page Break Integration

No changes needed to the page-break algorithm — it already accumulates `onLayout` heights for all blocks. Image blocks emit `onLayout` just like text blocks.

### Visible View Integration

For the visible (non-measuring) view, render `ImageBlock`s identically:

```tsx
{block.kind === 'image' && (
  <View className="my-3 items-center">
    <Image
      source={{ uri: block.uri }}
      className="w-full rounded-lg"
      style={{ height: undefined, aspectRatio: undefined }}
      resizeMode="contain"
    />
  </View>
)}
```

## Files Changed

| File | Changes |
|---|---|
| `apps/mobile/lib/epub-parser.ts` | Export `EpubManifestItem` with `mediaType` field; build manifest with media types |
| `apps/mobile/hooks/use-epub.ts` | Build `imageCacheRef` in `loadFromUri`; resolve `<img>` tags in `loadChapterContent`; expose image cache to component |
| `apps/mobile/lib/parse-markdown.ts` | Add `ImageBlock` type; export `ContentBlock = TextBlock \| ImageBlock`; split on `[IMG:...]` markers |
| `apps/mobile/app/(tabs)/(reading)/epub.tsx` | Render `ImageBlock`s in measuring + visible views; update block type references from `TextBlock` to `ContentBlock` |

## Cover Image Flow

Building the image cache during `loadFromUri` also unifies cover image loading with inline image loading. This lets the mobile reader match the web app's EPUB open flow exactly:

### Current web flow (apps/web)

```
User opens EPUB
  → epubjs parses file, extracts cover
  → Cover is displayed centered in the reader layout
  → User taps cover → coverTapped = true → loadChapter(firstChapterHref)
  → Reading pane replaces cover
```

### Current mobile flow (apps/mobile)

```
User opens EPUB
  → parseOPF extracts coverBase64 from manifest metadata
  → Cover is loaded separately from the zip (special-case code path)
  → Cover shown full-screen with "Tap to open" label
  → User taps → openFromCover() → loadChapter(firstSpineItem)
  → Reading pane replaces cover
```

The logic is functionally equivalent, but the cover loading uses a separate code path from inline images.

### Unified flow (after this spec)

```
User opens EPUB
  → loadFromUri builds imageCache (all manifest images)
  → Cover image is looked up from imageCache (same mechanism as inline images)
  → Cover displayed centered in reader layout
  → User taps cover → coverTapped = true → loadChapter(firstSpineItem)
  → Reading pane replaces cover
```

**What changes in the code:**

1. **Remove the special-case cover extraction** — Currently `loadFromUri` has a dedicated block (lines 163–165) that reads the cover file from the zip, encodes it to base64, and constructs a `data:image/jpeg;base64,...` URI. After this spec, the cover is already in `imageCacheRef` — just look it up by its manifest href.

2. **Unify the cover rendering** — Instead of a separate full-screen cover state with `<Image source={{ uri: epub.coverUrl }}>`, render the cover as a standard `ImageBlock` at the start of the first chapter's content blocks. The cover then naturally flows into the reading pane — it appears on page 1 before the chapter text begins.

3. **Match web behavior exactly** — The web app uses epubjs's `b.coverUrl()` which returns the cover as a blob URL, then renders it in the reader layout. After this spec, mobile does the same thing: the cover is just another image block in the content stream, rendered by the same `<Image>` component.

**Implementation sketch:**

```typescript
// In use-epub.ts — loadFromUri, after building imageCache:
const coverHref = meta.coverBase64; // manifest href of cover image
if (coverHref) {
  const coverResolvedPath = resolvePathFn(opfDir, coverHref);
  const coverDataUri = imageCacheRef.current.get(coverResolvedPath);
  if (coverDataUri) {
    setCoverUrl(coverDataUri); // same state, now from unified cache
  }
}
```

```typescript
// In epub.tsx — split cover state into CoverBlock rendering:
// Instead of a separate full-screen cover return path, prepend a synthetic
// ImageBlock to the first chapter's blocks when coverTapped is false.
// When the user taps the cover ImageBlock, set coverTapped = true and
// the cover block is removed, revealing the chapter text behind it.
```

**Simpler alternative:** Keep the separate cover state as-is, but source the `coverUrl` from `imageCacheRef` instead of a dedicated zip extraction. This is a minimal change (delete ~4 lines, add ~3 lines) that still unifies the cover loading path without changing the UX.

## Edge Cases

- **SVG images** — React Native doesn't render SVG natively. Skip SVG items in the image cache or convert to PNG via a server endpoint (future enhancement).
- **Missing images** — If `zip.file(path)` returns null for an image href, skip it silently. Don't inject an `[IMG:...]` marker.
- **Large images** — Base64 encoding increases size by ~33%. For books with many large images, memory usage could be significant. Consider a size threshold (skip images > 5MB) or on-demand loading.
- **CSS background images** — EPUBs may use `background-image` in inline styles. Not supported — only `<img src>` tags are handled.
- **Image in heading** — If an `<img>` appears inside an `<h1>`–`<h6>`, it will be extracted as a separate `ImageBlock` before the heading text is parsed. The heading text will render without the image.
- **Empty chapter** — A chapter containing only images (no text) will produce an array of only `ImageBlock`s. The existing `TextBlock`-filtering logic in `visibleBlocks` filtering (lines ~95-98 in epub.tsx) will need updating to not filter out image blocks.

## Dependencies

- SPEC-009 (Reader Layout System) — the EPUB reader page already uses the shared layout
- ARCH-013 (EPUB Reader Architecture) — this spec extends the existing architecture
- No new npm packages required

## Implementation Attempts

**Status: UNRESOLVED** — as of 2025-07-25, four separate implementation attempts have been made. None have succeeded in displaying the cover image when an EPUB opens. The feature remains unimplemented.

### Attempt 1 — Agent 1 (branch `a`, commit `5c2a85b8`)

**Changes:**
- `epub-parser.ts`: Added `EpubManifestItem` with `mediaType`; added `coverItemId` to `EpubMetadata`
- `use-epub.ts`: Built `imageCacheRef` in `loadFromUri`; injected `[IMG:dataUri]` markers in `loadChapterContent`; moved `setRestoring(false)` after `loadFromUri`
- `parse-markdown.ts`: Added `ImageBlock` + `ContentBlock` union; split on `[IMG:...]` markers
- `epub.tsx`: Rendered `ImageBlock` in measuring + visible views; added restore loading guard

**Bugs:**
- `openFromCover` referenced `loadChapter` before its `const` declaration (TDZ reference error at runtime)
- Hardcoded `image/jpeg` MIME type for cover — broken for PNG covers
- `resolvePathFn` didn't normalize `../` paths — `zip.file()` missed files
- `loadChapterContent` resolved img paths via `contentDir + src` concatenation, which didn't normalize `../` segments — cache lookups never matched
- No EPUB 3 `properties="cover-image"` cover detection

**Outcome:** Cover not showing. Committed to branch `a`.

### Attempt 2 — Agent 2 (branch `b`, commit `7451726a`)

**Changes over Attempt 1:**
- Re-parsed `<item>` elements from OPF XML in `loadFromUri` to build image cache (separate from `parseOPF`)
- Sourced cover from `imageCacheRef` first, with direct zip fallback
- Used shared `resolvePath` from `epub-parser.ts` for nav doc and NCX lookups
- Added `resolveImagePath()` helper for content-doc-relative img resolution

**Bugs:**
- Same `loadChapterContent` `contentDir + src` bug — img paths with `../` still never matched cache keys
- Same hardcoded `image/jpeg` fallback for cover MIME type
- `parseMarkdownBlocks` split regex may have left edge cases with some marker formats

**Outcome:** Cover not showing. Committed to branch `b`.

### Attempt 3 — Agent 3 (branch `c`, commit `ed5beb08`)

**Changes over Attempt 2:**
- Added EPUB 3 `properties="cover-image"` detection in `parseOPF`
- `resolvePathFn` now normalizes `../` segments (split/join with stack)
- `extractAttr` supports single-quoted XML attributes
- `restoredRef` guard to prevent double-execution of restore effect
- `openFromCover` moved after `loadChapter` to fix TDZ
- EPUB 2 fallback also checks `<meta property="cover">`

**Bugs:**
- Same `loadChapterContent` `contentDir + src` bug still present — `resolvePathFn` was available but not used for img `src` resolution in `loadChapterContent`
- `extractAttr` regex pattern `name="([^"]+)"` used `+` quantifier (one or more), which would fail on empty attribute values like `alt=""`

**Outcome:** Cover not showing. Committed to branch `c`.

### Attempt 4 — Agent 4 (branch `d`, commit `24ab0209`)

**Changes over Attempt 3:**
- **Root cause fix:** `loadChapterContent` now uses `resolvePath(contentDir, src)` for img path resolution — this normalizes `../` segments so cache keys actually match
- `extractAttr` updated to `*` quantifier (zero or more) — handles empty attribute values and supports both double and single quotes via two regex attempts
- EPUB 2 cover detection handles both `name="cover"` and `property="cover"`
- `resolvePath` (exported from `epub-parser.ts`) now normalizes `../` and handles absolute paths by stripping leading `/`
- `index.tsx` and `web-reader.tsx` also updated to `ContentBlock` with `kind`-based narrowing
- `epub.tsx` uses `if (block.kind === 'image') return ...` early-return pattern for proper TypeScript discriminated union narrowing
- `contentWidth` computed from `useWindowDimensions` for image measurement

**Remaining issues (cover still not showing):**
- Possible causes not yet ruled out:
  - The cover image item may use a MIME type not in `IMAGE_MIME_TYPES` (e.g., `image/svg+xml`, `image/bmp`, `image/tiff`)
  - The cover may be referenced via `<guide><reference type="cover">` (EPUB 2) rather than `<meta>` or `properties="cover-image"`
  - The cover image may be in a nested zip directory structure where `opfDir` derivation from `container.xml` yields a path different from the actual zip entries
  - The EPUB may have no explicit cover metadata at all — the cover is simply the first page of the first spine item
  - `zip.file()` may return null if the path uses a different slash convention or encoding than expected
  - The restore flow may still have a race condition where `coverTapped` is set to `true` before `coverUrl` is available

**Recommended next debugging steps:**
1. Add `console.log` in `loadFromUri` to dump `meta.coverBase64`, `meta.coverItemId`, and the resolved zip path
2. Log all manifest items with image MIME types to verify the cover is being identified
3. Log `coverItem?.mediaType` to check if it's in `IMAGE_MIME_TYPES`
4. Try with a known-simple EPUB 2 file that uses `<meta name="cover">` to isolate EPUB 3 vs EPUB 2 issues
5. Check if the `restoredRef` guard might be preventing `loadFromUri` from running at all in some scenarios

**Outcome:** Cover not showing. Committed to branch `d`.

### Summary

| Attempt | Branch | Commit | Key contribution | Cover works? |
|---|---|---|---|---|
| 1 | `a` | `5c2a85b8` | Initial `ImageBlock` type, `[IMG:]` marker system, image cache | No |
| 2 | `b` | `7451726a` | `resolveImagePath()` helper, cover-from-cache pattern | No |
| 3 | `c` | `ed5beb08` | EPUB 3 `cover-image` detection, `../` normalization in `resolvePathFn`, single-quote attr support | No |
| 4 | `d` | `24ab0209` | Fixed `../` in img resolution, `*` quantifier in `extractAttr`, `property="cover"` support, `ContentBlock` narrowing in all readers | No |

**Inline image rendering** (images within chapter content) was implemented successfully across all attempts — the `[IMG:dataUri]` marker → `ImageBlock` → `<Image>` pipeline is structurally sound. The **cover image** specifically remains the unresolved piece, likely due to EPUB metadata detection or zip path resolution rather than the rendering pipeline itself.
