import { ZOOM_TO_REM } from '@/lib/text-scale';

/** Default leading ratio for reader text (matches TokenizedText/settings). */
export const READER_DEFAULT_LEADING = 1.625;

/**
 * Page-width clamp for the reader content column: the text column never
 * exceeds this many CSS pixels, so wide screens keep a book-like measure.
 * The clamp is applied on top of the leading margins (both sides), i.e. the
 * outer box is READER_PAGE_WIDTH + 2 × leading.
 */
export const READER_PAGE_WIDTH = 720;

/** Rendered L2 body-text line height in CSS pixels. */
export function readerLeadingPx(zoom: number, leading: number): number {
  const zoomRem = ZOOM_TO_REM[zoom] ?? 1;
  return Math.round(16 * zoomRem * leading);
}

/**
 * Reader content style: the text column is padded by the L2 body-text
 * leading on BOTH sides (the distance from the device edge to the text edge
 * equals the text's leading), and clamped to `READER_PAGE_WIDTH` with the
 * leftover width distributed equally (auto margins), so the column stays
 * centered on wide screens. The same object is applied to the visible
 * content and the hidden measuring mirror so measured line wraps match.
 */
export function readerHorizontalPadding(
  zoom: number,
  leading: number,
): {
  paddingLeft: number;
  paddingRight: number;
  maxWidth: number;
  marginLeft: 'auto';
  marginRight: 'auto';
} {
  const L = readerLeadingPx(zoom, leading);
  return {
    paddingLeft: L,
    paddingRight: L,
    maxWidth: READER_PAGE_WIDTH + 2 * L,
    marginLeft: 'auto',
    marginRight: 'auto',
  };
}
