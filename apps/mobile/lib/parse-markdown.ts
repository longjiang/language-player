/**
 * Mobile shim for the unified markdown core (SPEC-083).
 *
 * The shared `parseMarkdownBlocks` (packages/shared/src/markdown) is the
 * single markdown parser for BOTH apps. This module keeps the mobile alias
 * `@/lib/parse-markdown` working for existing importers and preserves the
 * legacy web-reader normalization: genuinely flat plain text (no markdown
 * markers AND no existing blank-line paragraph breaks, e.g. an email or a
 * document paste) becomes separate paragraphs.
 */

import {
  parseMarkdownBlocks as sharedParseMarkdownBlocks,
  type ContentBlock,
  type FormatRange,
  type ImageBlock,
  type TableBlock,
  type TextBlock,
} from '@langplayer/shared';

export type { ContentBlock, FormatRange, ImageBlock, TableBlock, TextBlock };

/**
 * Mobile fallback for inline images (SPEC-087 §2 revised).
 *
 * The shared parser now keeps a mixed text+image paragraph as ONE text block
 * with `image` format ranges (web renders them inline). The mobile native
 * paragraph renderer does not yet draw inline images, so a text+image block
 * would render the alt text and DROP the image. This post-pass splits such
 * blocks back into adjacent text / standalone `ImageBlock`s — the pre-change
 * shape — so mobile keeps showing the image (as a block sized to the page)
 * until native inline-image drawing lands.
 *
 * Web deliberately does NOT run this pass: it renders the image inline.
 */
export function splitInlineImageBlocks(blocks: ContentBlock[]): ContentBlock[] {
  const out: ContentBlock[] = [];
  for (const block of blocks) {
    if (block.kind === 'text') {
      const imageFormats = block.formats
        .filter((f) => f.type === 'image')
        .sort((a, b) => a.start - b.start);
      if (imageFormats.length > 0) {
        out.push(...splitTextBlockImages(block, imageFormats));
        continue;
      }
    }
    out.push(block);
  }
  return out;
}

/** Split one text block on its inline image ranges into segments + ImageBlocks. */
function splitTextBlockImages(
  block: TextBlock,
  images: FormatRange[],
): ContentBlock[] {
  const out: ContentBlock[] = [];
  let cursor = 0;
  const segment = (start: number, end: number, carrySrcId: boolean): ContentBlock | null => {
    const text = block.text.slice(start, end);
    if (!text.trim()) return null;
    const formats: FormatRange[] = block.formats
      .filter((f) => f.type !== 'image' && f.end > start && f.start < end)
      .map((f) => ({
        start: Math.max(f.start, start) - start,
        end: Math.min(f.end, end) - start,
        type: f.type,
        ...(f.url !== undefined ? { url: f.url } : {}),
      }));
    const seg: TextBlock = {
      kind: 'text',
      type: block.type,
      text,
      formats,
    };
    if (block.depth !== undefined) seg.depth = block.depth;
    if (block.listDepth !== undefined) seg.listDepth = block.listDepth;
    if (block.ordered !== undefined) seg.ordered = block.ordered;
    if (block.start !== undefined) seg.start = block.start;
    if (carrySrcId && block.srcElementId) seg.srcElementId = block.srcElementId;
    return seg;
  };
  for (const img of images) {
    if (img.start > cursor) {
      const seg = segment(cursor, img.start, cursor === 0);
      if (seg) out.push(seg);
    }
    out.push({ kind: 'image', uri: img.url ?? '', alt: img.alt ?? '' });
    cursor = img.end;
  }
  if (cursor < block.text.length) {
    const seg = segment(cursor, block.text.length, cursor === 0);
    if (seg) out.push(seg);
  }
  return out;
}

/** Regex matching markdown syntax at line start or inline patterns. */
const MD_PATTERN = /^(#{1,6}\s|[*\-\+] |\d+\. |> |---+|\|)|```|\[.*\]\(.*\)|!\[.*\]\(.*\)|<[a-z][\s\S]*>/m;

/**
 * Detect if text is plain (no markdown markers). When the user pastes plain
 * text with single line breaks (e.g. from an email or document), each line
 * should become a separate paragraph. Markdown text is left untouched.
 */
function isPlainText(text: string): boolean {
  if (!text.trim()) return true;
  return !MD_PATTERN.test(text);
}

/**
 * Normalize single \n to \n\n for plain text only, without doubling existing
 * \n\n. Handles \r\n, \n\r, and \n consistently.
 */
function normalizeNewlines(text: string): string {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return normalized.replace(/(?<!\n)\n(?!\n)/g, '\n\n');
}

/** Parse markdown into shared content blocks (mobile web-reader path). */
export function parseMarkdownBlocks(md: string): ContentBlock[] {
  // Only fold single line breaks into paragraphs for genuinely "flat" plain
  // text — no markdown markers AND no existing blank-line paragraph breaks.
  // Structured text (image-reader OCR, PDF page→markdown) already separates
  // its blocks with blank lines, so its soft line breaks are left in place and
  // the shared parser groups them into one paragraph per block, letting the
  // text reflow instead of fragmenting line-by-line.
  const normalized = isPlainText(md) && !/\n\s*\n/.test(md) ? normalizeNewlines(md) : md;
  return splitInlineImageBlocks(sharedParseMarkdownBlocks(normalized));
}
