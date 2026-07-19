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

/** All languages available on the platform (matching Classic LANGS_WITH_CONTENT). */
export const SUPPORTED_L2S = [
  'ab', 'acf', 'acu', 'af', 'aib', 'ain', 'akk', 'am', 'ami', 'ang', 'ar',
  'arb', 'arc', 'as', 'ase', 'ay', 'az', 'ba', 'be', 'bg', 'bho', 'bn', 'bo',
  'br', 'bs', 'bsk', 'ca', 'ceb', 'cjy', 'ckb', 'cnr', 'cop', 'cpx',
  'crh', 'cs', 'csb', 'cy', 'czo', 'da', 'de', 'dsb', 'dz', 'el', 'en', 'enm',
  'eo', 'es', 'eso', 'et', 'eu', 'fa', 'fi', 'fo', 'fr', 'fsl', 'fur', 'fy',
  'ga', 'gan', 'gd', 'gkp', 'gl', 'gn', 'goh', 'got', 'grc', 'gsw', 'gu', 'gv',
  'ha', 'hak', 'hbo', 'he', 'hi', 'hil', 'hne', 'hni', 'hr', 'hsh', 'hsn', 'hu',
  'hy', 'ia', 'id', 'ig', 'ii', 'ik', 'ins', 'is', 'it', 'ja', 'jam', 'jv',
  'ka', 'kab', 'kac', 'kk', 'kl', 'km', 'kn', 'ko', 'kok', 'krl', 'ksw', 'ku',
  'kvk', 'ky', 'la', 'lad', 'lb', 'ln', 'lo', 'lt', 'ltc', 'lv', 'lzh', 'mai',
  'mg', 'mhx', 'mi', 'min', 'mk', 'ml', 'mn', 'mni', 'mnp', 'mr', 'ms', 'mt',
  'mxv', 'my', 'nan', 'nb', 'ne', 'nl', 'nn', 'no', 'non', 'nsl', 'nv', 'oc',
  'och', 'ojp', 'om', 'or', 'osc', 'pa', 'pes', 'pis', 'pl', 'pms', 'prs', 'ps',
  'pt', 'qu', 'rm', 'ro', 'ru', 'ryu', 'sa', 'sah', 'sc', 'scn', 'sco', 'sd',
  'se', 'sh', 'si', 'sjn', 'sk', 'sl', 'sli', 'sm', 'so', 'sq', 'sr', 'srm',
  'ss', 'su', 'sux', 'sv', 'svk', 'sw', 'ta', 'te', 'tg', 'th', 'ti', 'tl',
  'tlh', 'tr', 'tsd', 'tt', 'ug', 'uk', 'ur', 'uz', 'vec', 'vi', 'vo', 'wo',
  'wuu', 'xh', 'xpe', 'yi', 'yo', 'yue', 'za', 'zh', 'zu',
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

/** ISO 639-1 → ISO 639-3 code mapping. Codes that are identical in both
 *  standards (e.g., 'ca', 'fi', 'ko', 'vi') are omitted — only codes
 *  that differ are listed. Sourced from languages.csv. */
export const ISO639_1_TO_3: Record<string, string> = {
  aa: 'aar', ab: 'abk', ae: 'ave', af: 'afr', ak: 'aka', am: 'amh',
  an: 'arg', ar: 'ara', as: 'asm', av: 'ava', ay: 'aym', az: 'aze',
  ba: 'bak', be: 'bel', bg: 'bul', bi: 'bis', bm: 'bam', bn: 'ben',
  bo: 'bod', br: 'bre', bs: 'bos', ca: 'cat', ce: 'che', ch: 'cha',
  co: 'cos', cr: 'cre', cs: 'ces', cu: 'chu', cv: 'chv', cy: 'cym',
  da: 'dan', de: 'deu', dv: 'div', dz: 'dzo', ee: 'ewe', el: 'ell',
  en: 'eng', eo: 'epo', es: 'spa', et: 'est', eu: 'eus', fa: 'fas',
  ff: 'ful', fi: 'fin', fj: 'fij', fo: 'fao', fr: 'fra', fy: 'fry',
  ga: 'gle', gd: 'gla', gl: 'glg', gn: 'grn', gu: 'guj', gv: 'glv',
  ha: 'hau', he: 'heb', hi: 'hin', ho: 'hmo', hr: 'hrv', ht: 'hat',
  hu: 'hun', hy: 'hye', hz: 'her', ia: 'ina', id: 'ind', ie: 'ile',
  ig: 'ibo', ii: 'iii', ik: 'ipk', io: 'ido', is: 'isl', it: 'ita',
  iu: 'iku', ja: 'jpn', jv: 'jav', ka: 'kat', kg: 'kon', ki: 'kik',
  kj: 'kua', kk: 'kaz', kl: 'kal', km: 'khm', kn: 'kan', ko: 'kor',
  kr: 'kau', ks: 'kas', ku: 'kur', kv: 'kom', kw: 'cor', ky: 'kir',
  la: 'lat', lb: 'ltz', lg: 'lug', li: 'lim', ln: 'lin', lo: 'lao',
  lt: 'lit', lu: 'lub', lv: 'lav', mg: 'mlg', mh: 'mah', mi: 'mri',
  mk: 'mkd', ml: 'mal', mn: 'mon', mr: 'mar', ms: 'msa', mt: 'mlt',
  my: 'mya', na: 'nau', nb: 'nob', nd: 'nde', ne: 'nep', ng: 'ndo',
  nl: 'nld', nn: 'nno', no: 'nor', nr: 'nbl', nv: 'nav', ny: 'nya',
  oc: 'oci', oj: 'oji', om: 'orm', or: 'ori', os: 'oss', pa: 'pan',
  pi: 'pli', pl: 'pol', ps: 'pus', pt: 'por', qu: 'que', rm: 'roh',
  rn: 'run', ro: 'ron', ru: 'rus', rw: 'kin', sa: 'san', sc: 'srd',
  sd: 'snd', se: 'sme', sg: 'sag', sh: 'hbs', si: 'sin', sk: 'slk',
  sl: 'slv', sm: 'smo', sn: 'sna', so: 'som', sq: 'sqi', sr: 'srp',
  ss: 'ssw', st: 'sot', su: 'sun', sv: 'swe', sw: 'swa', ta: 'tam',
  te: 'tel', tg: 'tgk', th: 'tha', ti: 'tir', tk: 'tuk', tl: 'tgl',
  tn: 'tsn', to: 'ton', tr: 'tur', ts: 'tso', tt: 'tat', tw: 'twi',
  ty: 'tah', ug: 'uig', uk: 'ukr', ur: 'urd', uz: 'uzb', ve: 'ven',
  vi: 'vie', vo: 'vol', wa: 'wln', wo: 'wol', xh: 'xho', yi: 'yid',
  yo: 'yor', za: 'zha', zh: 'zho', zu: 'zul',
} as const;

/** Convert an ISO 639-1 code to its ISO 639-3 equivalent.
 *  If the code is already ISO 639-3 or has no mapping, returns as-is. */
export function iso639_3(code: string): string {
  return ISO639_1_TO_3[code] ?? code;
}

// ── Difficulty → Level ────────────────────────

/**
 * Per-language difficulty thresholds.
 * Fetched from GET /difficulty-profiles and cached client-side.
 * Each entry is a 7-element array: thresholds for levels 1–7.
 */
export type DifficultyProfile = Record<string, number[]>;

/**
 * Map a video difficulty value to a 1–7 level using per-language thresholds.
 * Returns undefined if the language has no profile or difficulty is null.
 */
export function getLevelFromDifficulty(
  difficulty: number | null | undefined,
  profile: number[] | undefined,
): number | undefined {
  if (difficulty == null || !profile || profile.length === 0) return undefined;
  for (let i = 0; i < profile.length; i++) {
    if (difficulty <= profile[i]!) return i + 1;
  }
  return profile.length;
}
