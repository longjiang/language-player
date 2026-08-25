import { ZOOM_TO_REM } from '@/lib/text-scale';

/** Default leading ratio for reader text (matches TokenizedText / settings). */
export const READER_DEFAULT_LEADING = 1.625;

/**
 * Page-width clamp for the reader content column: the text column never
 * exceeds this many px, so tablets keep a book-like measure. The clamp is
 * applied on top of the leading margins (both sides), i.e. the outer box is
 * READER_PAGE_WIDTH + 2 × leading.
 */
export const READER_PAGE_WIDTH = 720;

/**
 * The L2 body text's rendered line-height in px — its typographic "leading".
 * TokenizedText renders body text at `16 × zoomRem × textScale` px and a line
 * height of `round(fontSize × leading)` (the user's leading ratio, default
 * 1.625 → 26px at zoom 1).
 *
 * Reader layout rule: the side-by-side text|translation gap and the reader's
 * side margins (device edge → text edge) both equal this value, so text rows
 * and the translation column share a single visual pitch.
 */
export function readerLeadingPx(zoom: number, leading: number, textScale = 1): number {
  const zoomRem = ZOOM_TO_REM[zoom] ?? 1;
  return Math.round(16 * textScale * zoomRem * leading);
}

/**
 * Reader content horizontal padding: BOTH margins equal the text's leading
 * (the distance from the device edge to the text edge equals the text's
 * leading). `total` feeds the pagination content-width math so measured
 * widths match the visible ScrollView.
 */
export function readerHorizontalPadding(
  zoom: number,
  leading: number,
  textScale = 1,
): { left: number; right: number; total: number } {
  const left = readerLeadingPx(zoom, leading, textScale);
  return { left, right: left, total: left + left };
}

/**
 * Clamp the available content width to the book measure: the text column is
 * never wider than READER_PAGE_WIDTH, so on tablets the column is centered
 * with the leftover width distributed equally (the visible ScrollView wraps
 * the column in a centered View of this width).
 */
export function readerClampedContentWidth(availableWidth: number): number {
  return Math.min(Math.max(0, availableWidth), READER_PAGE_WIDTH);
}
