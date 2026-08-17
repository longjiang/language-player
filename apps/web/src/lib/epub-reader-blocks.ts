/**
 * Bridge between the EPUB flat block model and the shared markdown reader
 * stream.
 *
 * The notes reader, the web reader and the EPUB reader all render the same
 * markdown block stream (`ReaderBlock` from `@/lib/parse-markdown`). This
 * module converts the EPUB model's per-spine blocks (`EpubBlock[]`) into that
 * shared stream **1:1** — no reordering — so the block index inside a spine
 * item stays identical whether it is read as an `EpubBlock` (used for
 * navigation, TOC, search and `#fragment` resolution) or as a `ReaderBlock`
 * (used for rendering). `BookLocation { spineIndex, blockIndex, offset }`
 * therefore aligns between the two views without a separate index map.
 */

import type { MarkdownBlock, ReaderBlock } from '@/lib/parse-markdown';
import type {
  EpubBlock,
  EpubImageBlock,
  EpubTextBlock,
} from '@/lib/epub-book-types';

/** Render the alt text as an image-only markdown block. */
function imageToMarkdown(img: EpubImageBlock, alt: string): MarkdownBlock {
  const url = img.imageUri;
  return { kind: 'markdown', raw: url ? `![${alt}](${url})` : alt || ' ' };
}

/**
 * Convert a spine document's `EpubBlock[]` to the shared `ReaderBlock[]`,
 * preserving index order. One `EpubTextBlock` becomes one `TextBlock`; a
 * `pre`/code block and any image become a raw `MarkdownBlock` so the shared
 * ReactMarkdown rendering handles them (code blocks, figures) exactly like
 * the web reader.
 */
export function epubBlocksToReaderBlocks(
  blocks: EpubBlock[],
  spineIndex: number,
): ReaderBlock[] {
  return blocks.map((block, blockIndex) =>
    block.kind === 'image'
      ? imageToMarkdown(block, block.alt ?? '')
      : textBlockToReaderBlock(block, spineIndex, blockIndex),
  );
}

function textBlockToReaderBlock(
  tb: EpubTextBlock,
  spineIndex: number,
  blockIndex: number,
): ReaderBlock {
  // Shared markdown model has no `pre` TextBlock — code renders richly via
  // ReactMarkdown (fenced code), matching the web reader's handling of
  // markdown `code` blocks. Preserve the whitespace verbatim: code leads
  // with significant indentation.
  if (tb.type === 'pre') {
    return { kind: 'markdown', raw: `\`\`\`\n${tb.text}\n\`\`\`` };
  }
  return {
    kind: 'text',
    type: tb.type,
    ...(tb.depth !== undefined ? { depth: tb.depth } : {}),
    text: tb.text,
    formats: tb.formats,
  };
}
