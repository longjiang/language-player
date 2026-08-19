import { ZOOM_TO_REM } from '@/lib/text-scale';

/** Default leading ratio for reader text (matches TokenizedText / settings). */
export const READER_DEFAULT_LEADING = 1.625;

/** Right-side content padding of the reader (unchanged legacy `px-4`). */
export const READER_RIGHT_PADDING = 16;

/**
 * The L2 body text's rendered line-height in px — its typographic "leading".
 * TokenizedText renders body text at `16 × zoomRem × textScale` px and a line
 * height of `round(fontSize × leading)` (the user's leading ratio, default
 * 1.625 → 26px at zoom 1).
 *
 * Reader layout rule: the side-by-side text|translation gap and the reader's
 * left margin (device edge → text edge) both equal this value, so text rows
 * and the translation column share a single visual pitch.
 */
export function readerLeadingPx(zoom: number, leading: number, textScale = 1): number {
  const zoomRem = ZOOM_TO_REM[zoom] ?? 1;
  return Math.round(16 * textScale * zoomRem * leading);
}

/**
 * Reader content horizontal padding: left = the text's leading (so the
 * distance from the device's left edge to the text's left edge equals the
 * text's leading), right stays the legacy 16px. `total` feeds the pagination
 * content-width math so measured widths match the visible ScrollView.
 */
export function readerHorizontalPadding(
  zoom: number,
  leading: number,
  textScale = 1,
): { left: number; right: number; total: number } {
  const left = readerLeadingPx(zoom, leading, textScale);
  return { left, right: READER_RIGHT_PADDING, total: left + READER_RIGHT_PADDING };
}
