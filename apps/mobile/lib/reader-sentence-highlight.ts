/**
 * Reader translation-sentence highlight helpers (SPEC-082 Task 4).
 *
 * Tapping a token in the L2 text highlights the paired translation sentence,
 * matching apps/web's sentence highlight. The reader renders translations per
 * page keyed by a block's LOCAL index within the page's text blocks
 * (`use-epub-pagination` resets the map whenever the page's text-block set
 * changes), while tokens are identified by their GLOBAL block index. These
 * helpers resolve a tapped block's translation slot the same way
 * `renderBlock` looks translations up, so the tap-highlight works on every
 * page — not just the first one where global and local indices happen to
 * coincide.
 */

import type { ContentBlock, TextBlock } from '@/lib/parse-markdown';

/** Reader body text blocks — the only blocks that get per-paragraph
 *  translations (paragraph / blockquote / list-item / heading). */
export function isReaderTextBlock(b: ContentBlock): b is TextBlock {
  return (
    b.kind === 'text'
    && (b.type === 'paragraph' || b.type === 'blockquote' || b.type === 'list-item' || b.type === 'heading')
  );
}

/** Local index of `blk` within the current page's text blocks — the keying
 *  of `blockTranslations`. Returns -1 when the block is not a text block or
 *  is not on the current page. */
export function localTextBlockIndex(
  visibleBlocks: ContentBlock[] | null | undefined,
  blk: ContentBlock | undefined,
): number {
  if (!blk || !visibleBlocks) return -1;
  return visibleBlocks.filter(isReaderTextBlock).indexOf(blk as TextBlock);
}
