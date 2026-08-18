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
 * `TokenizedTextSettings`). The clamp bounds/default live in the shared
 * `@langplayer/utils` module (SPEC-082 Task 1) so web and mobile agree; the
 * rem-based sizing helpers below are web-specific.
 */

import {
  TRANSLATION_FACTOR,
  TRANSLATION_SIZE_MIN,
  TRANSLATION_SIZE_MAX,
  clampTranslationSize,
  translationSizeFactor,
} from '@langplayer/utils';

export { TRANSLATION_FACTOR, TRANSLATION_SIZE_MIN, TRANSLATION_SIZE_MAX, clampTranslationSize, translationSizeFactor };

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
