# SPEC-012: EPUB Image Rendering (Mobile)

## Metadata
- **Spec ID**: SPEC-012
- **Feature**: Render inline images from EPUB content documents on mobile
- **Status**: draft
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

## Open Questions

1. **SVG support** — Should we skip SVGs entirely, or add a server-side rasterization endpoint? Decision: skip for v1.
2. **Max image width** — Should it be the full content width, or capped (e.g., 80%)? Decision: full width with `resizeMode="contain"` for v1.
3. **Image captions** — Some EPUBs use `<figure>/<figcaption>`. Should we extract captions? Decision: not in v1; captions will be lost during HTML stripping.
