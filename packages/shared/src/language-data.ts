/**
 * Language data constants used by both web and mobile.
 *
 * This is the single source of truth — every platform imports from here
 * instead of duplicating inline arrays.
 */

/** Legacy combined list used by both L1 and L2 pickers. Prefer
 *  `POPULAR_L1S` / `POPULAR_L2S` so each column can be ordered independently. */
export const POPULAR_LANGUAGES: readonly string[] = [
  'en', 'zh-Hans', 'zh-Hant', 'zh', 'ja', 'ko', 'es', 'fr', 'de', 'it', 'pt', 'ru',
  'ar', 'hi', 'tr', 'nl', 'pl', 'sv', 'th', 'vi', 'id',
];

/** Top native (L1) languages shown first in the L1 column. */
export const POPULAR_L1S: readonly string[] = [
  'en', 'zh-Hans', 'zh-Hant', 'ja', 'ko', 'es', 'fr', 'de', 'it', 'pt', 'ru',
  'ar', 'hi', 'tr', 'nl', 'pl', 'sv', 'th', 'vi', 'id',
];

/**
 * Top target (L2) languages shown first in the L2 column.
 *
 * Ordered by observed study activity (watch events) as of 2026-08-09 — see
 * ARCH-021 and ADR-0030.
 */
export const POPULAR_L2S: readonly string[] = [
  'zh', 'en', 'ja', 'ko', 'fr', 'de', 'es',
  'vi', 'ru', 'ar', 'tr', 'it', 'hi', 'yue', 'th', 'id', 'nl', 'he', 'pt',
];

/**
 * The 110 target languages shown as "All Languages" in every platform's
 * language picker (web, mobile, Chrome extension). These are the languages
 * with measured video content — ARCH-025 Tables A–C (2026-08-11). Single
 * source of truth; platform pickers must not define their own list.
 */
export const CONTENT_L2S: readonly string[] = [
  'af', 'am', 'ami', 'ar', 'as', 'ase', 'az', 'be', 'bg', 'bn',
  'bo', 'br', 'ca', 'ceb', 'ckb', 'cnr', 'cs', 'cy', 'da', 'de',
  'el', 'en', 'eo', 'es', 'et', 'eu', 'fa', 'fi', 'fo', 'fr',
  'ga', 'gd', 'gl', 'grc', 'gsw', 'gu', 'hak', 'he', 'hi', 'hr',
  'hsh', 'hu', 'hy', 'id', 'ins', 'is', 'it', 'ja', 'jv', 'ka',
  'kac', 'kk', 'km', 'kn', 'ko', 'ku', 'ky', 'la', 'lb', 'lo',
  'lt', 'lv', 'lzh', 'mg', 'mi', 'mk', 'ml', 'mn', 'mr', 'ms',
  'mt', 'my', 'nan', 'nl', 'no', 'nsl', 'och', 'pa', 'pl', 'pt',
  'qu', 'ro', 'ru', 'sa', 'si', 'sk', 'sl', 'sm', 'so', 'sq',
  'sr', 'su', 'sv', 'svk', 'sw', 'ta', 'te', 'th', 'tl', 'tlh',
  'tr', 'tt', 'uk', 'ur', 'uz', 'vi', 'wo', 'yo', 'yue', 'zh',
];

export type ContentL2 = (typeof CONTENT_L2S)[number];

/** Number of picker "All Languages" (110) — same as CONTENT_L2S.length. */
export const CONTENT_L2_COUNT = CONTENT_L2S.length;

/**
 * Native self-names for the supported L1 languages. The L1 picker shows
 * each language in its own script (English, Français, Deutsch, Español…)
 * rather than translated into the UI locale.
 */
const NATIVE_LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  'zh-Hans': '中文（简体）',
  'zh-Hant': '中文（繁體）',
  zh: '中文',
  ar: 'العربية',
  de: 'Deutsch',
  es: 'Español',
  fr: 'Français',
  id: 'Bahasa Indonesia',
  it: 'Italiano',
  ja: '日本語',
  ko: '한국어',
  nl: 'Nederlands',
  pl: 'Polski',
  pt: 'Português',
  ru: 'Русский',
  th: 'ไทย',
  tr: 'Türkçe',
  vi: 'Tiếng Việt',
};

/** Native self-name for a language code (fallback: English name). */
export function nativeLanguageName(code: string): string {
  return (
    NATIVE_LANGUAGE_NAMES[code] ??
    NATIVE_LANGUAGE_NAMES[code.split('-')[0]!] ??
    code.toUpperCase()
  );
}

/**
 * Table C — experimental L2s with no dedicated server tokenizer (regex
 * fallback only). ARCH-025 Table C (2026-08-11). Pickers show a badge for
 * these languages.
 */
export const EXPERIMENTAL_L2S: readonly string[] = [
  'af', 'am', 'ami', 'as', 'ase', 'az', 'be', 'bn', 'br', 'ceb',
  'ckb', 'cnr', 'eo', 'eu', 'fo', 'grc', 'gsw', 'gu', 'hsh', 'ins',
  'jv', 'kac', 'kk', 'kn', 'ku', 'ky', 'mg', 'mi', 'ml', 'mn',
  'mr', 'mt', 'nsl', 'pa', 'qu', 'sa', 'si', 'sm', 'so', 'su',
  'svk', 'ta', 'te', 'tlh', 'tt', 'ur', 'uz', 'wo', 'yo',
];

const EXPERIMENTAL_L2_SET: ReadonlySet<string> = new Set(EXPERIMENTAL_L2S);

/** True when an L2 is experimental (Table C, no dedicated tokenizer). */
export function isExperimentalL2(code: string): boolean {
  return EXPERIMENTAL_L2_SET.has(code.split('-')[0]!);
}

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

/**
 * Languages with a Python inflection/conjugation backend endpoint
 * (/inflect-japanese, /inflect-korean, /inflect-pattern, /inflect-pymorphy).
 * All other languages (Chinese, Thai, Vietnamese, …) are isolating — they get
 * no inflection UI and search only uses the head + script variants.
 */
export const INFLECTABLE_LANGUAGES: readonly string[] = [
  'ja', 'ko', 'en', 'de', 'it', 'es', 'fr', 'nl', 'ru', 'uk',
];

const INFLECTABLE_SET: ReadonlySet<string> = new Set(INFLECTABLE_LANGUAGES);

/** True when a language has an inflection/conjugation backend endpoint
 *  (ja, ko, en, de, it, es, fr, nl, ru, uk). False for isolating languages
 *  like Chinese, Thai, Vietnamese. Handles BCP 47 subtags (zh-Hans → zh). */
export function isInflectable(code: string): boolean {
  return INFLECTABLE_SET.has(code.split('-')[0]!.toLowerCase());
}

// ── Language flag emoji ─────────────────────────

/**
 * Sign-language codes render a waving-hand emoji (👋) instead of a national
 * flag, since flags are not meaningful for signed languages.
 */
const SIGN_LANGUAGE_CODES: ReadonlySet<string> = new Set([
  'ase', 'eso', 'fsl', 'hsh', 'ins', 'kvk', 'nsl', 'svk',
]);

/**
 * Flag emoji per language code (regional-indicator approximations).
 * Curated for the supported/popular set — anything unmapped falls back to
 * a globe emoji. Lookup normalizes via baseCode (zh-Hans → zh) and falls
 * back to the raw code first so regional variants can override.
 */
const LANGUAGE_FLAGS: Record<string, string> = {
  en: '🇬🇧',
  'zh-Hans': '🇨🇳', 'zh-Hant': '🌐', zh: '🇨🇳', yue: '🇭🇰',
  af: '🇿🇦', ar: '🇸🇦', ca: '🇦🇩', de: '🇩🇪', el: '🇬🇷',
  es: '🇪🇸', fi: '🇫🇮', fr: '🇫🇷', ga: '🇮🇪', hi: '🇮🇳',
  hr: '🇭🇷', hu: '🇭🇺', id: '🇮🇩', it: '🇮🇹', ja: '🇯🇵',
  ko: '🇰🇷', nl: '🇳🇱', no: '🇳🇴', pl: '🇵🇱', pt: '🇵🇹',
  ro: '🇷🇴', ru: '🇷🇺', sr: '🇷🇸', sv: '🇸🇪', sw: '🇰🇪',
  th: '🇹🇭', tr: '🇹🇷', vi: '🇻🇳',
  uk: '🇺🇦', cs: '🇨🇿', da: '🇩🇰', bg: '🇧🇬', et: '🇪🇪',
  fa: '🇮🇷', he: '🇮🇱', sk: '🇸🇰', sl: '🇸🇮', lt: '🇱🇹',
  lv: '🇱🇻', sq: '🇦🇱', mk: '🇲🇰', ms: '🇲🇾', bn: '🇧🇩',
  ta: '🇮🇳', te: '🇮🇳', ml: '🇮🇳', kn: '🇮🇳', mr: '🇮🇳',
  gu: '🇮🇳', pa: '🇮🇳', ur: '🇵🇰', km: '🇰🇭', lo: '🇱🇦',
  my: '🇲🇲', ne: '🇳🇵', si: '🇱🇰', ka: '🇬🇪', hy: '🇦🇲',
  az: '🇦🇿', kk: '🇰🇿', ky: '🇰🇬', uz: '🇺🇿', tg: '🇹🇯',
  mn: '🇲🇳', am: '🇪🇹', ti: '🇪🇷', so: '🇸🇴', yo: '🇳🇬',
  ig: '🇳🇬', ha: '🇳🇬', xh: '🇿🇦', zu: '🇿🇦', wo: '🇸🇳',
  mg: '🇲🇬', is: '🇮🇸', lb: '🇱🇺', mt: '🇲🇹', bs: '🇧🇦',
  sh: '🇷🇸', cy: '🏴󠁧󠁢󠁷󠁬󠁳󠁿', gd: '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
};

const FALLBACK_FLAG = '🌐';

/** Flag emoji for a language code (fallback: globe; sign languages: 👋). */
export function flagEmoji(code: string): string {
  const normalized = code.split('-')[0]!.toLowerCase();
  if (SIGN_LANGUAGE_CODES.has(normalized)) return '👋';
  return LANGUAGE_FLAGS[code] ?? LANGUAGE_FLAGS[normalized] ?? FALLBACK_FLAG;
}
