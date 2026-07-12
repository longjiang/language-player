// ──────────────────────────────────────────────
// Language Constants — all language lists used across the platform
// ──────────────────────────────────────────────

/** Languages supported as a user's native language (L1). */
export const SUPPORTED_L1S = [
  'en', 'zh-Hans', 'zh-Hant', 'af', 'ar', 'ca', 'de', 'el',
  'es', 'fi', 'fr', 'ga', 'hi', 'hr', 'hu', 'id', 'it',
  'ja', 'ko', 'nl', 'no', 'pl', 'pt', 'ro', 'ru', 'sr',
  'sv', 'sw', 'th', 'tr', 'vi',
] as const;

export type SupportedL1 = (typeof SUPPORTED_L1S)[number];

/** Languages that have at least 50+ videos with human-translated subtitles. */
export const SUPPORTED_L2S = [
  'en', 'zh', 'ko', 'it', 'fr', 'de', 'es', 'ja', 'pt',
  'ru', 'tr', 'pl', 'nl', 'id', 'da', 'th', 'sv', 'uk',
  'no', 'fi', 'ca', 'vi', 'he', 'ar', 'cs', 'el', 'sk',
  'ro', 'hu', 'fa', 'sr', 'ms', 'bg', 'lt', 'lv', 'sl',
  'tl', 'ur', 'ta', 'et', 'hr', 'eo', 'gl', 'cy', 'ka',
  'is', 'hy', 'bn', 'la', 'be', 'te', 'km', 'mk', 'ga',
  'pa', 'my', 'sq', 'eu', 'ku', 'kn', 'ml', 'bs', 'mt',
  'sw', 'af', 'lo', 'am', 'so', 'yo', 'fy', 'yi', 'ne',
  'zu', 'ha', 'ps', 'sm', 'mi', 'gd', 'lb',
] as const;

export type SupportedL2 = (typeof SUPPORTED_L2S)[number];

/** Languages supported by YouTube's automatic captioning. */
export const LANGS_YOUTUBE_SUPPORTS = [
  'aa', 'ab', 'af', 'am', 'ar', 'as', 'ay', 'az', 'ba', 'be',
  'bg', 'bh', 'bi', 'bn', 'bo', 'br', 'bs', 'ca', 'co', 'cs',
  'cy', 'da', 'de', 'dz', 'el', 'en', 'eo', 'es', 'et', 'eu',
  'fa', 'ff', 'fi', 'fj', 'fo', 'fr', 'fy', 'ga', 'gd', 'gl',
  'gn', 'gu', 'ha', 'haw', 'he', 'hi', 'ho', 'hr', 'ht', 'hu',
  'hy', 'ia', 'id', 'ie', 'ig', 'ik', 'is', 'it', 'iu', 'ja',
  'jv', 'ka', 'kk', 'kl', 'km', 'kn', 'ko', 'ks', 'ku', 'ky',
  'la', 'lb', 'ln', 'lo', 'lt', 'lus', 'lv', 'mai', 'mas', 'mg',
  'mi', 'mk', 'ml', 'mn', 'mni', 'mo', 'mr', 'ms', 'mt', 'my',
  'nan', 'nb', 'ne', 'nl', 'nn', 'no', 'nv', 'oc', 'om', 'or',
  'pa', 'pap', 'pl', 'ps', 'pt', 'qu', 'rm', 'rn', 'ro', 'ru',
  'rw', 'sa', 'sc', 'scn', 'sd', 'sg', 'sh', 'si', 'sk', 'sl',
  'sm', 'sn', 'so', 'sq', 'sr', 'ss', 'st', 'su', 'sv', 'sw',
  'ta', 'te', 'tg', 'th', 'ti', 'tk', 'tl', 'tlh', 'tn', 'to',
  'tpi', 'tr', 'ts', 'tt', 'tw', 'ug', 'uk', 'ur', 'uz', 've',
  'vi', 'vo', 'wo', 'xh', 'yi', 'yo', 'yue', 'zh', 'zu',
] as const;

/** Languages with live TV channels available. */
export const LANGS_WITH_LIVE_TV = [
  'amh', 'ara', 'aze', 'bak', 'ben', 'bos', 'bul', 'cat', 'ces',
  'cmn', 'cnr', 'dan', 'deu', 'ell', 'eng', 'est', 'fas', 'fra',
  'fry', 'glg', 'heb', 'hin', 'hrv', 'hun', 'hye', 'iku', 'ind',
  'isl', 'ita', 'jpn', 'kan', 'kat', 'kaz', 'kin', 'kor', 'kur',
  'lao', 'lav', 'lit', 'ltz', 'mal', 'mkd', 'mlt', 'mri', 'nan',
  'nep', 'nld', 'nor', 'pan', 'pol', 'por', 'pus', 'ron', 'rus',
  'sin', 'slk', 'slv', 'som', 'spa', 'sqi', 'srp', 'swe', 'tam',
  'tel', 'tgl', 'tha', 'tur', 'ukr', 'urd', 'vie', 'yue', 'zho',
] as const;

/** Languages supported by Azure Translate. */
export const LANGS_WITH_AZURE_TRANSLATE = [
  'af', 'am', 'ar', 'as', 'az', 'ba', 'bg', 'bn', 'bo', 'bs',
  'ca', 'cs', 'cy', 'da', 'de', 'dsb', 'dv', 'el', 'en', 'es',
  'et', 'eu', 'fa', 'fi', 'fil', 'fj', 'fo', 'fr', 'ga', 'gl',
  'gom', 'gu', 'ha', 'he', 'hi', 'hr', 'hsb', 'ht', 'hu', 'hy',
  'id', 'ig', 'ikt', 'is', 'it', 'iu', 'ja', 'ka', 'kk', 'km',
  'kmr', 'kn', 'ko', 'ku', 'ky', 'ln', 'lo', 'lt', 'lug', 'lv',
  'lzh', 'mai', 'mg', 'mi', 'mk', 'ml', 'mn', 'mr', 'ms', 'mt',
  'mww', 'my', 'no', 'nb', 'ne', 'nl', 'nso', 'nya', 'or', 'otq',
  'pa', 'pl', 'prs', 'ps', 'pt', 'ro', 'ru', 'run', 'rw', 'sd',
  'si', 'sk', 'sl', 'sm', 'sn', 'so', 'sq', 'sr', 'st', 'sv',
  'sw', 'ta', 'te', 'th', 'ti', 'tk', 'tlh', 'tn', 'to', 'tr',
  'tt', 'ty', 'ug', 'uk', 'ur', 'uz', 'vi', 'xh', 'yo', 'yua',
  'yue', 'zh', 'zu',
] as const;

/** Languages with lexical divergence data (for difficulty calculation). */
export const LANGS_WITH_LEX_DIV = [
  'ar', 'ast', 'bg', 'ca', 'cs', 'da', 'de', 'el', 'en', 'enm',
  'es', 'fa', 'fi', 'fr', 'ga', 'gd', 'gl', 'gv', 'hr', 'hu',
  'hy', 'id', 'is', 'it', 'ja', 'ka', 'ko', 'la', 'lb', 'lt',
  'lv', 'mk', 'ms', 'my', 'nl', 'no', 'pl', 'pt', 'ro', 'ru',
  'se', 'sh', 'sk', 'sl', 'sq', 'sv', 'sw', 'tl', 'tr', 'uk',
  'zh',
] as const;

/** Languages with word frequency data. */
export const LANGS_WITH_WORD_FREQ = [
  'ar', 'bg', 'bn', 'bs', 'ca', 'cs', 'da', 'de', 'el', 'en',
  'es', 'fa', 'fi', 'fr', 'he', 'hi', 'hr', 'hu', 'hy', 'id',
  'it', 'ja', 'ko', 'lt', 'lv', 'mk', 'ms', 'nl', 'no', 'pl',
  'pt', 'ro', 'ru', 'sk', 'sl', 'sq', 'sr', 'sv', 'th', 'tl',
  'tr', 'uk', 'vi', 'zh',
] as const;
