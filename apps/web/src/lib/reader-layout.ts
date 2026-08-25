import { ZOOM_TO_REM } from '@/lib/text-scale';

/** Default leading ratio for reader text (matches TokenizedText/settings). */
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

/** Rendered L2 body-text line height in CSS pixels. */
export function readerLeadingPx(zoom: number, leading: number): number {
  const zoomRem = ZOOM_TO_REM[zoom] ?? 1;
  return Math.round(16 * zoomRem * leading);
}

/**
 * Reader content style: the text column is padded by the L2 body-text
 * leading on BOTH sides (the margin from the text edge to the screen/column
 * edge equals the text's leading). The outer box is clamped to
 * `CONTENT_CONTAINER_WIDTH + 2 × L`, so the text column itself is at most
 * min(CONTENT_CONTAINER_WIDTH, screen width − 2 × L): on phones it fills the
 * screen minus a leading margin on each side; on wide screens it matches the
 * top bar's content span (logo → avatar). Auto margins keep the column
 * centered. The same object is applied to the visible content and the hidden
 * measuring mirror so measured line wraps match.
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
    maxWidth: CONTENT_CONTAINER_WIDTH + 2 * L,
    marginLeft: 'auto',
    marginRight: 'auto',
  };
}
