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
