import { SUPPORTED_L1S, SUPPORTED_L2S, LANGS_YOUTUBE_SUPPORTS, LANGS_WITH_LIVE_TV } from '@langplayer/shared';

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

// Subset of language names for the most common languages
const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English', zh: '中文', 'zh-Hans': '中文（简体）', 'zh-Hant': '中文（繁體）',
  ja: '日本語', ko: '한국어', es: 'Español', fr: 'Français', de: 'Deutsch',
  it: 'Italiano', pt: 'Português', ru: 'Русский', ar: 'العربية', hi: 'हिन्दी',
  tr: 'Türkçe', nl: 'Nederlands', pl: 'Polski', sv: 'Svenska', da: 'Dansk',
  fi: 'Suomi', no: 'Norsk', cs: 'Čeština', ro: 'Română', hu: 'Magyar',
  el: 'Ελληνικά', he: 'עברית', th: 'ไทย', vi: 'Tiếng Việt', id: 'Bahasa Indonesia',
  ms: 'Bahasa Melayu', uk: 'Українська', ca: 'Català', eu: 'Euskara',
  fa: 'فارسی', ur: 'اردو', bn: 'বাংলা', ta: 'தமிழ்', sw: 'Kiswahili',
  af: 'Afrikaans', sq: 'Shqip', am: 'አማርኛ', hy: 'Հայերեն', my: 'မြန်မာ',
  hr: 'Hrvatski', et: 'Eesti', ka: 'ქართული', is: 'Íslenska', ga: 'Gaeilge',
  lv: 'Latviešu', lt: 'Lietuvių', mk: 'Македонски', mt: 'Malti',
  sr: 'Српски', sk: 'Slovenčina', sl: 'Slovenščina', so: 'Soomaali',
  tl: 'Tagalog', cy: 'Cymraeg', yo: 'Yorùbá', zu: 'isiZulu', la: 'Latina',
  eo: 'Esperanto', bg: 'Български', ne: 'नेपाली', km: 'ខ្មែរ', lo: 'ລາວ',
  mn: 'Монгол', ps: 'پښتو', si: 'සිංහල', uz: 'Oʻzbek', kk: 'Қазақша',
  az: 'Azərbaycan', be: 'Беларуская', bs: 'Bosanski', gl: 'Galego',
  ml: 'മലയാളം', kn: 'ಕನ್ನಡ', te: 'తెలుగు', mr: 'मराठी', gu: 'ગુજરાતી',
  pa: 'ਪੰਜਾਬੀ',
};

/** Get display name for a language code. */
export function languageName(code: string): string {
  return LANGUAGE_NAMES[code] ?? code.toUpperCase();
}

/** Check if a language code uses RTL direction. */
export function isRTL(code: string): boolean {
  const baseCode = code.split('-')[0]!;
  return RTL_CODES.has(baseCode);
}

/** Check if a language uses Han (Chinese) characters. */
export function isHan(code: string): boolean {
  return HAN_CODES.has(code);
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
  'en', 'zh', 'ja', 'ko', 'es', 'fr', 'de', 'it', 'pt', 'ru',
  'ar', 'hi', 'tr', 'nl', 'pl', 'sv', 'th', 'vi', 'id',
] as const;

/** Group language codes into common categories for the selector UI. */
export function getLanguageGroups(): { label: string; codes: readonly string[] }[] {
  return [
    { label: 'Popular', codes: POPULAR_LANGUAGES },
    { label: 'All Languages', codes: SUPPORTED_L2S },
  ];
}
