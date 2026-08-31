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
  return sharedParseMarkdownBlocks(normalized);
}
