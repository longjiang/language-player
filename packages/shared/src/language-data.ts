/**
 * Language data constants used by both web and mobile.
 *
 * This is the single source of truth — every platform imports from here
 * instead of duplicating inline arrays.
 */

/** Top languages shown first in the language picker, matching Classic. */
export const POPULAR_LANGUAGES: readonly string[] = [
  'en', 'zh-Hans', 'zh-Hant', 'zh', 'ja', 'ko', 'es', 'fr', 'de', 'it', 'pt', 'ru',
  'ar', 'hi', 'tr', 'nl', 'pl', 'sv', 'th', 'vi', 'id',
];

/**
 * Languages written without spaces between words (scriptio continua) — CJK
 * varieties, Japanese, Thai, Khmer, Lao, Burmese, Tibetan, Vietnamese, and a
 * few related varieties. Ported from
 * `language-player-3/constants/LanguageConstants.ts` and normalized to use
 * ISO 639-1 codes wherever one exists (`cmn`/`zho` → `zh`, etc.); varieties
 * with no ISO 639-1 code (Cantonese `yue`, Wu `wuu`, …) keep their ISO 639-3
 * code.
 *
 * Sketch Engine concordance sentences arrive with a space between every
 * token (e.g. `的 提示 等 本人 確認 を 行っ て`); clients strip those spaces
 * for continua languages so the sentence reads naturally.
 */
export const CONTINUA_LANGUAGES: readonly string[] = [
  'bo', 'cdo', 'cjy', 'cnp', 'cpx', 'csp', 'czo', 'dz', 'hak', 'hsn',
  'ja', 'km', 'lo', 'ltc', 'lzh', 'mnp', 'my', 'nan', 'och', 'ryu', 'soa',
  'th', 'vi', 'wuu', 'yue', 'zh',
];

const CONTINUA_SET: ReadonlySet<string> = new Set(CONTINUA_LANGUAGES);

/** True when a language code is written without spaces between words
 *  (e.g. zh, ja, th, km, lo, my, bo, vi). Handles BCP 47 subtags
 *  (zh-Hans → zh). */
export function isContinua(code: string): boolean {
  return CONTINUA_SET.has(code.split('-')[0]!.toLowerCase());
}
