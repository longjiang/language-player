import { SUPPORTED_L1S, SUPPORTED_L2S, LANGS_YOUTUBE_SUPPORTS, LANGS_WITH_LIVE_TV } from '@langplayer/shared';
import { baseCode } from '@langplayer/utils';
import { LOCALIZED_LANGUAGE_NAMES } from './language-names-i18n';

/**
 * Extended language metadata — name, direction, scripts, capabilities.
 * Ported from language-player-3/src/languages.ts.
 */

export interface LanguageMeta {
  code: string;
  name: string;
  vernacularName?: string;
  direction: 'ltr' | 'rtl';
  han: boolean;
  stats: {
    videoCount: number;
  };
  has: {
    content: boolean;
    youtube: boolean;
    liveTV: boolean;
    azureTranslate: boolean;
  };
}

// RTL languages
const RTL_CODES = new Set(['ar', 'he', 'fa', 'ur', 'ps', 'sd', 'yi', 'ku']);

// Han (Chinese character) languages
const HAN_CODES = new Set(['zh', 'yue', 'lzh', 'nan', 'hak', 'wuu', 'hsn', 'cjy', 'cpx', 'czh', 'cdo', 'cng', 'gan', 'mnp']);

// Language display names — native script for major languages, English for the rest.
// TODO: migrate to i18n keys (lang.${code}) using translations-languages.csv for localized names.
const LANGUAGE_NAMES: Record<string, string> = {
  ab: 'Abkhaz', acf: 'Saint Lucian Creole French', acu: 'Achuar',
  af: 'Afrikaans', aib: 'Aynu', ain: 'Ainu', akk: 'Akkadian',
  am: 'አማርኛ', ami: 'Amis', ang: 'Old English', ar: 'العربية',
  arb: 'Standard Arabic', arc: 'Aramaic', as: 'Assamese',
  ase: 'American Sign Language', ay: 'Aymara', az: 'Azərbaycan',
  ba: 'Bashkir', be: 'Беларуская', bg: 'Български', bho: 'Bhojpuri',
  bn: 'বাংলা', bo: 'Tibetan', br: 'Breton', bs: 'Bosanski',
  bsk: 'Burushaski', ca: 'Català', ceb: 'Cebuano', cjy: 'Jin',
  ckb: 'Central Kurdish', cmn: 'Mandarin', cnr: 'Montenegrin Standard',
  cop: 'Coptic', cpx: 'Puxian', crh: 'Crimean Tatar', cs: 'Čeština',
  csb: 'Kashubian', cy: 'Cymraeg', czo: 'Min Zhong', da: 'Dansk',
  de: 'Deutsch', dsb: 'Lower Sorbian', dz: 'Dzongkha', el: 'Ελληνικά',
  en: 'English', enm: 'Middle English', eo: 'Esperanto', es: 'Español',
  eso: 'Estonian Sign Language', et: 'Eesti', eu: 'Euskara',
  fa: 'فارسی', fi: 'Suomi', fo: 'Faroese', fr: 'Français',
  fsl: 'French Sign Language', fur: 'Friulian', fy: 'West Frisian',
  ga: 'Gaeilge', gan: 'Gan', gd: 'Scottish Gaelic',
  gkp: 'Guinea Kpelle', gl: 'Galego', gn: 'Guaraní',
  goh: 'Old High German', got: 'Gothic', grc: 'Ancient Greek',
  gsw: 'Alemannic German', gu: 'ગુજરાતી', gv: 'Manx', ha: 'Hausa',
  hak: 'Hakka', hbo: 'Ancient Hebrew', he: 'עברית', hi: 'हिन्दी',
  hil: 'Hiligaynon', hne: 'Chhattisgarhi', hni: 'Hani', hr: 'Hrvatski',
  hsh: 'Hungarian Sign Language', hsn: 'Xiang', hu: 'Magyar',
  hy: 'Հայերեն', ia: 'Interlingua', id: 'Bahasa Indonesia', ig: 'Igbo',
  ii: 'Sichuan Yi', ik: 'Inupiaq', ins: 'Indian Sign Language',
  is: 'Íslenska', it: 'Italiano', ja: '日本語', jam: 'Jamaican Creole',
  jv: 'Javanese', ka: 'ქართული', kab: 'Kabyle', kac: 'Jingpho',
  kk: 'Қазақша', kl: 'Greenlandic', km: 'ខ្មែរ', kn: 'ಕನ್ನಡ',
  ko: '한국어', kok: 'Konkani', krl: 'Karelian', ksw: "S'gaw Karen",
  ku: 'Kurdish', kvk: 'Korean Sign Language', ky: 'Kyrgyz', la: 'Latina',
  lad: 'Ladino', lb: 'Luxembourgish', ln: 'Lingala', lo: 'ລາວ',
  lt: 'Lietuvių', ltc: 'Middle Chinese', lv: 'Latviešu',
  lzh: 'Literary Chinese', mai: 'Maithili', mg: 'Malagasy',
  mhx: 'Lhao Vo', mi: 'Maori', min: 'Minangkabau', mk: 'Македонски',
  ml: 'മലയാളം', mn: 'Монгол', mni: 'Manipuri', mnp: 'Min Bei',
  mr: 'मराठी', ms: 'Bahasa Melayu', mt: 'Malti',
  mxv: 'Metlatónoc Mixtec', my: 'မြန်မာ', nan: 'Min Nan',
  nb: 'Norwegian Bokmål', ne: 'नेपाली', nl: 'Nederlands',
  nn: 'Norwegian Nynorsk', no: 'Norsk', non: 'Old Norse',
  nsl: 'Norwegian Sign Language', nv: 'Navajo', oc: 'Occitan',
  och: 'Old Chinese', ojp: 'Old Japanese', om: 'Oromo', or: 'Odia',
  osc: 'Oscan', pa: 'ਪੰਜਾਬੀ', pes: 'Western Farsi', pis: 'Pijin',
  pl: 'Polski', pms: 'Piedmontese', prs: 'Dari', ps: 'پښتو',
  pt: 'Português', qu: 'Quechua', rm: 'Romansch', ro: 'Română',
  ru: 'Русский', ryu: 'Okinawan', sa: 'Sanskrit', sah: 'Yakut',
  sc: 'Sardinian', scn: 'Sicilian', sco: 'Scots', sd: 'Sindhi',
  se: 'Northern Sami', sh: 'Serbo-Croatian', si: 'සිංහල',
  sjn: 'Sindarin', sk: 'Slovenčina', sl: 'Slovenščina',
  sli: 'Lower Silesian', sm: 'Samoan', so: 'Soomaali', sq: 'Shqip',
  sr: 'Српски', srm: 'Saramaccan', ss: 'Swazi', su: 'Sundanese',
  sux: 'Sumerian', sv: 'Svenska', svk: 'Slovakian Sign Language',
  sw: 'Kiswahili', ta: 'தமிழ்', te: 'తెలుగు', tg: 'Tajik',
  th: 'ไทย', ti: 'Tigrinya', tl: 'Tagalog', tlh: 'Klingon',
  tr: 'Türkçe', tsd: 'Tsakonian', tt: 'Tatar', ug: 'Uyghur',
  uk: 'Українська', ur: 'اردو', uz: 'Oʻzbek', vec: 'Venetian',
  vi: 'Tiếng Việt', vo: 'Volapük', wo: 'Wolof', wuu: 'Wu',
  xh: 'Xhosa', xpe: 'Liberia Kpelle', yi: 'Yiddish', yo: 'Yorùbá',
  yue: 'Cantonese', za: 'Zhuang', zh: '中文',
  'zh-Hans': '中文（简体）', 'zh-Hant': '中文（繁體）', zu: 'isiZulu',
};

/**
 * Get display name for a language code.
 * @param code - ISO 639-1 or 639-3 language code
 * @param uiLocale - Optional UI locale for localized name (e.g., "ko" → "Korean" in en, "coreano" in es).
 *                   When omitted, returns the name in its own native script (e.g., "한국어" for ko).
 */
export function languageName(code: string, uiLocale?: string): string {
  if (uiLocale) {
    // Normalize zh-Hans/zh-Hant → zh for both code and locale in i18n lookup
    const lookupLocale = uiLocale.startsWith('zh-') ? 'zh' : uiLocale;
    const lookupCode = code.startsWith('zh-') ? 'zh' : code;
    const localeNames = LOCALIZED_LANGUAGE_NAMES[lookupLocale];
    if (localeNames?.[lookupCode]) return localeNames[lookupCode];
    // Fall back to English
    const enNames = LOCALIZED_LANGUAGE_NAMES['en'];
    if (enNames?.[lookupCode]) return enNames[lookupCode];
  }
  return LANGUAGE_NAMES[code] ?? code.toUpperCase();
}

/** Strip BCP47 subtags (e.g., zh-Hans → zh) for backend compatibility.
 * The backend uses ISO 639-1 primary language codes only.
 * Re-exported from @langplayer/utils for cross-platform use. */
export { baseCode };

/** Check if a language code uses RTL direction. */
export function isRTL(code: string): boolean {
  return RTL_CODES.has(baseCode(code));
}

/** Check if a language uses Han (Chinese) characters. */
export function isHan(code: string): boolean {
  return HAN_CODES.has(baseCode(code));
}

/** Get full language metadata for a given code. */
export function getLanguageMeta(code: string): LanguageMeta | null {
  if (!SUPPORTED_L1S.includes(code as any) && !SUPPORTED_L2S.includes(code as any)) {
    return null;
  }

  return {
    code,
    name: languageName(code),
    direction: isRTL(code) ? 'rtl' : 'ltr',
    han: isHan(code),
    stats: {
      videoCount: 0, // populated dynamically by API
    },
    has: {
      content: true,
      youtube: LANGS_YOUTUBE_SUPPORTS.includes(code as any),
      liveTV: LANGS_WITH_LIVE_TV.includes(code as any),
      azureTranslate: true,
    },
  };
}

/** Top languages to show first in the language selector. */
export const POPULAR_LANGUAGES = [
  'en', 'zh-Hans', 'zh-Hant', 'zh', 'ja', 'ko', 'es', 'fr', 'de', 'it', 'pt', 'ru',
  'ar', 'hi', 'tr', 'nl', 'pl', 'sv', 'th', 'vi', 'id',
] as const;

/** Group language codes into common categories for the selector UI. */
export function getLanguageGroups(): { label: string; codes: readonly string[] }[] {
  return [
    { label: 'Popular', codes: POPULAR_LANGUAGES },
    { label: 'All Languages', codes: SUPPORTED_L2S },
  ];
}
