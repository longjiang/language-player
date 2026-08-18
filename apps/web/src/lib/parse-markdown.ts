/**
 * Web shim for the unified markdown core (SPEC-083).
 *
 * The shared `parseMarkdownBlocks` (packages/shared/src/markdown) is the
 * single markdown parser for BOTH apps. This module keeps the web
 * `@/lib/parse-markdown` API (`parseMarkdown` → `ReaderBlock`) working for
 * existing importers:
 * - text blocks pass through as the shared TextBlock;
 * - non-text blocks (tables, code fences, images, hr, raw HTML) become raw
 *   `MarkdownBlock`s via `reconstructRaw` so the reader's ReactMarkdown
 *   rendering path keeps working unchanged.
 *
 * Behavior upgrades over the legacy remark-only walker (intended, SPEC-083):
 * GFM tables are now parsed into TableBlocks (and rendered as real tables),
 * code fences / hr / raw HTML become markdown-kind blocks instead of being
 * dropped, mixed text+image paragraphs split into separate blocks, and list
 * items carry listDepth/ordered/start.
 */

import {
  parseMarkdownBlocks,
  reconstructRaw,
  type ContentBlock,
  type FormatRange,
  type TextBlock,
} from '@langplayer/shared';

export type { FormatRange, TextBlock };

export interface MarkdownBlock {
  kind: 'markdown';
  raw: string;
}

export type ReaderBlock = TextBlock | MarkdownBlock;

/** True when a reconstructed raw block has no visible content. */
function isEmptyMarkdown(raw: string): boolean {
  return raw
    .replace(/!\[[^\]]*\]\(\s*\)/g, '') // empty images
    .replace(/^\s*[-*+]\s+/, '')        // list marker
    .replace(/[\[\]()*_`>#\s]/g, '')    // remaining markdown punctuation
    .length === 0;
}

function toReaderBlock(block: ContentBlock): ReaderBlock | null {
  if (block.kind === 'text') return block;
  const raw = reconstructRaw(block);
  if (!raw || isEmptyMarkdown(raw)) return null;
  return { kind: 'markdown', raw };
}

/** Parse markdown into web reader blocks (shared core + raw fallbacks). */
export function parseMarkdown(md: string): ReaderBlock[] {
  return parseMarkdownBlocks(md)
    .map(toReaderBlock)
    .filter((b): b is ReaderBlock => b !== null);
}
