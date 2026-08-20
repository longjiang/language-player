import { ZOOM_TO_REM } from '@/lib/text-scale';

/** Default leading ratio for reader text (matches TokenizedText/settings). */
export const READER_DEFAULT_LEADING = 1.625;

/** Right-side reader padding retained from the existing web layout. */
export const READER_RIGHT_PADDING = 16;

/** Rendered L2 body-text line height in CSS pixels. */
export function readerLeadingPx(zoom: number, leading: number): number {
  const zoomRem = ZOOM_TO_REM[zoom] ?? 1;
  return Math.round(16 * zoomRem * leading);
}

/** Reader content padding: left follows leading; right stays 16px. */
export function readerHorizontalPadding(
  zoom: number,
  leading: number,
): { paddingLeft: number; paddingRight: number } {
  return {
    paddingLeft: readerLeadingPx(zoom, leading),
    paddingRight: READER_RIGHT_PADDING,
  };
}
