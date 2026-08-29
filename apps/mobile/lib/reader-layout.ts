import { ZOOM_TO_REM } from '@/lib/text-scale';

/** Default leading ratio for reader text (matches TokenizedText / settings). */
export const READER_DEFAULT_LEADING = 1.625;

/**
 * Content container width — the horizontal measure of the app's top bar
 * content (logo → avatar): the `max-w-7xl` (1280 px) container minus its
 * 16 px horizontal padding on each side → 1248 px. The reader text column is
 * clamped to this width (never wider than the header's content span), and on
 * narrow screens the "screen width − 2 × leading" bound wins instead — the
 * column's maximum width is min(CONTENT_CONTAINER_WIDTH, screen − 2 × L).
 */
export const CONTENT_CONTAINER_WIDTH = 1280 - 32; // 1248

/**
 * The L2 body text's rendered line-height in px — its typographic "leading".
 * TokenizedText renders body text at `16 × zoomRem × textScale` px and a line
 * height of `round(fontSize × leading)` (the user's leading ratio, default
 * 1.625 → 26px at zoom 1).
 *
 * Reader layout rule: the side-by-side text|translation gap and the reader's
 * side margins (text edge → screen edge) both equal this value, so text rows
 * and the translation column share a single visual pitch.
 */
export function readerLeadingPx(zoom: number, leading: number, textScale = 1): number {
  const zoomRem = ZOOM_TO_REM[zoom] ?? 1;
  return Math.round(16 * textScale * zoomRem * leading);
}

/**
 * Reader content horizontal padding: BOTH margins equal the text's leading
 * (the distance from the text edge to the screen edge equals the text's
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
 * Clamp the available content width: the text column is never wider than
 * CONTENT_CONTAINER_WIDTH (the top bar's content span), so on tablets the
 * column is centered with the leftover width distributed equally (the visible
 * ScrollView wraps the column in a centered View of this width). Together
 * with the leading padding, the column ends up at most
 * min(CONTENT_CONTAINER_WIDTH, screen width − 2 × leading) — on phones it
 * fills the screen minus a leading margin on each side.
 */
export function readerClampedContentWidth(availableWidth: number): number {
  return Math.min(Math.max(0, availableWidth), CONTENT_CONTAINER_WIDTH);
}
