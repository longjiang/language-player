/**
 * Helpers for sizing a block's L1 translation relative to its L2 tokenized
 * text (SPEC-082 Task 1/2).
 *
 * The translation:tokenized ratio is a user setting (`translationSize`, see
 * `TokenizedTextSettings` in `@langplayer/shared`). These helpers are pure
 * TS — no React/DOM — so web and mobile share the same clamp bounds and
 * default.
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

/** Settings shape that carries the optional `translationSize` field. */
export interface TranslationSizeSettings {
  tokenizedText?: { translationSize?: number };
}

/**
 * The translation-size factor to apply, read from settings: the clamped
 * `tokenizedText.translationSize` value, or `TRANSLATION_FACTOR` when unset.
 */
export function translationSizeFactor(settings: TranslationSizeSettings): number {
  const raw = settings.tokenizedText?.translationSize;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return TRANSLATION_FACTOR;
  return clampTranslationSize(raw);
}
