'use client';

/**
 * Helpers for sizing a block's L1 translation relative to its L2 tokenized
 * text. The L2 rendered font size is derived structurally: non-heading blocks
 * get their size from `TokenizedText` (which sets `fontSize` = the user's
 * text-zoom, in rem), while heading blocks inherit their size from the
 * heading element's Tailwind class (text-2xl/xl/lg) multiplied by the heading's
 * `zoom` factor.
 */

/** The translation font size expressed as a ratio of the L2 rendered size. */
export const TRANSLATION_FACTOR = 0.618;

/** The L2 tokenized text's rendered font size (rem) for a reader block. */
export function l2RenderedFontSizeRem(tb: { type: string; depth?: number }, zoom: number): number {
  if (tb.type === 'heading') {
    const headingRem: Record<number, number> = { 1: 1.5, 2: 1.25, 3: 1.125 };
    const base = headingRem[tb.depth ?? 1] ?? 1;
    return base * zoom;
  }
  // Non-heading blocks render at TokenizedText's `<fontSize> = zoom` rem.
  return zoom;
}

/** The translation font size (rem) = `TRANSLATION_FACTOR` × the L2 rendered
 *  size (incl. heading size and the user's text zoom). */
export function translationFontSizeRem(tb: { type: string; depth?: number }, zoom: number): number {
  return l2RenderedFontSizeRem(tb, zoom) * TRANSLATION_FACTOR;
}
