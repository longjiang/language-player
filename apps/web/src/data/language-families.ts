/**
 * Top-level language family per L2 code (ARCH-025 Tables A–C).
 * Isolates (Basque, Japanese, Korean) share one family bucket per request.
 */
export const LANGUAGE_FAMILIES: Record<string, string> = {
  // Indo-European
  en: 'Indo-European', de: 'Indo-European', nl: 'Indo-European',
  sv: 'Indo-European', da: 'Indo-European', no: 'Indo-European',
  is: 'Indo-European', fo: 'Indo-European', af: 'Indo-European',
  lb: 'Indo-European', gsw: 'Indo-European',
  fr: 'Indo-European', es: 'Indo-European', it: 'Indo-European',
  pt: 'Indo-European', ca: 'Indo-European', ro: 'Indo-European',
  gl: 'Indo-European', la: 'Indo-European',
  cy: 'Indo-European', ga: 'Indo-European', gd: 'Indo-European',
  br: 'Indo-European',
  ru: 'Indo-European', uk: 'Indo-European', pl: 'Indo-European',
  cs: 'Indo-European', sk: 'Indo-European', bg: 'Indo-European',
  sr: 'Indo-European',
  sl: 'Indo-European', hr: 'Indo-European', cnr: 'Indo-European',
  be: 'Indo-European', mk: 'Indo-European',
  lt: 'Indo-European', lv: 'Indo-European',
  fa: 'Indo-European', hi: 'Indo-European', ur: 'Indo-European',
  bn: 'Indo-European', gu: 'Indo-European', mr: 'Indo-European',
  pa: 'Indo-European', as: 'Indo-European', si: 'Indo-European',
  ku: 'Indo-European', ckb: 'Indo-European', sa: 'Indo-European',
  el: 'Indo-European', grc: 'Indo-European',
  hy: 'Indo-European', sq: 'Indo-European',

  // Sino-Tibetan
  zh: 'Sino-Tibetan', yue: 'Sino-Tibetan', nan: 'Sino-Tibetan',
  hak: 'Sino-Tibetan', lzh: 'Sino-Tibetan', och: 'Sino-Tibetan',
  bo: 'Sino-Tibetan', my: 'Sino-Tibetan', kac: 'Sino-Tibetan',

  // Austronesian
  id: 'Austronesian', ms: 'Austronesian', tl: 'Austronesian',
  jv: 'Austronesian', su: 'Austronesian', ceb: 'Austronesian',
  mi: 'Austronesian', sm: 'Austronesian', mg: 'Austronesian',
  ami: 'Austronesian',

  // Turkic
  tr: 'Turkic', az: 'Turkic', kk: 'Turkic', ky: 'Turkic',
  uz: 'Turkic', tt: 'Turkic',

  // Afro-Asiatic
  ar: 'Afro-Asiatic', he: 'Afro-Asiatic', am: 'Afro-Asiatic',
  mt: 'Afro-Asiatic', so: 'Afro-Asiatic',

  // Dravidian
  ta: 'Dravidian', te: 'Dravidian', kn: 'Dravidian', ml: 'Dravidian',

  // Uralic
  fi: 'Uralic', hu: 'Uralic', et: 'Uralic',

  // Austroasiatic
  vi: 'Austroasiatic', km: 'Austroasiatic',

  // Tai-Kadai
  th: 'Tai-Kadai', lo: 'Tai-Kadai',

  // Niger-Congo
  sw: 'Niger-Congo', yo: 'Niger-Congo', wo: 'Niger-Congo',

  // Sign languages
  ase: 'Sign languages', hsh: 'Sign languages', ins: 'Sign languages',
  nsl: 'Sign languages', svk: 'Sign languages',

  // Constructed
  eo: 'Constructed', tlh: 'Constructed',

  // Single-member families
  ka: 'Kartvelian', mn: 'Mongolic', qu: 'Quechuan',

  // Isolates
  eu: 'Isolates', ja: 'Isolates', ko: 'Isolates',
};

/** Family display name → translations.csv key (`family.*`). */
export const LANGUAGE_FAMILY_KEYS: Record<string, string> = {
  'Indo-European': 'family.indoeuropean',
  'Sino-Tibetan': 'family.sinotibetan',
  'Austronesian': 'family.austronesian',
  'Turkic': 'family.turkic',
  'Afro-Asiatic': 'family.afroasiatic',
  'Dravidian': 'family.dravidian',
  'Uralic': 'family.uralic',
  'Austroasiatic': 'family.austroasiatic',
  'Tai-Kadai': 'family.taikadai',
  'Niger-Congo': 'family.nigercongo',
  'Sign languages': 'family.signlanguages',
  'Constructed': 'family.constructed',
  'Kartvelian': 'family.kartvelian',
  'Mongolic': 'family.mongolic',
  'Quechuan': 'family.quechuan',
  'Isolates': 'family.isolates',
};
