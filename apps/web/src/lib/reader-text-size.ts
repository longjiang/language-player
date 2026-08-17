'use client';

/**
 * Helpers for sizing a block's L1 translation relative to its L2 tokenized
 * text. The L2 rendered font size is derived structurally: non-heading blocks
 * get their size from `TokenizedText` (which sets `fontSize` = the user's
 * text-zoom, in rem), while heading blocks inherit their size from the
 * heading element's Tailwind class (text-2xl/xl/lg) multiplied by the heading's
 * `zoom` factor.
 *
 * The translation:tokenized ratio is a user setting (`translationSize`, see
 * `TokenizedTextSettings`). These helpers accept the factor explicitly; when
 * omitted they fall back to `TRANSLATION_FACTOR` (the settings default).
 */

/** Default translation:tokenized ratio — matches `translationSize`'s default. */
export const TRANSLATION_FACTOR = 0.8;

/** Clamp bounds for the `translationSize` setting (shared with the slider). */
export const TRANSLATION_SIZE_MIN = 0.5;
export const TRANSLATION_SIZE_MAX = 1;

/** Clamp a translation-size factor into the valid range. */
export function clampTranslationSize(f: number): number {
  return Math.min(TRANSLATION_SIZE_MAX, Math.max(TRANSLATION_SIZE_MIN, f));
}

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

/** The translation font size (rem) = `factor` × the L2 rendered size (incl.
 *  heading size and the user's text zoom). */
export function translationFontSizeRem(
  tb: { type: string; depth?: number },
  zoom: number,
  factor: number = TRANSLATION_FACTOR,
): number {
  return l2RenderedFontSizeRem(tb, zoom) * clampTranslationSize(factor);
}
