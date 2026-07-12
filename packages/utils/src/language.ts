/**
 * Language utility functions — shared across platforms.
 */

/** Simple language-code → English name map (extend as needed). */
const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English', zh: 'Chinese', 'zh-Hans': 'Chinese (Simplified)',
  'zh-Hant': 'Chinese (Traditional)', ja: 'Japanese', ko: 'Korean',
  es: 'Spanish', fr: 'French', de: 'German', it: 'Italian',
  pt: 'Portuguese', ru: 'Russian', ar: 'Arabic', hi: 'Hindi',
  tr: 'Turkish', nl: 'Dutch', pl: 'Polish', sv: 'Swedish',
  da: 'Danish', fi: 'Finnish', no: 'Norwegian', cs: 'Czech',
  ro: 'Romanian', hu: 'Hungarian', el: 'Greek', he: 'Hebrew',
  th: 'Thai', vi: 'Vietnamese', id: 'Indonesian', ms: 'Malay',
  uk: 'Ukrainian', ca: 'Catalan', eu: 'Basque', gl: 'Galician',
  fa: 'Persian', ur: 'Urdu', bn: 'Bengali', ta: 'Tamil',
  te: 'Telugu', ml: 'Malayalam', kn: 'Kannada', mr: 'Marathi',
  gu: 'Gujarati', pa: 'Punjabi', sw: 'Swahili', af: 'Afrikaans',
  sq: 'Albanian', am: 'Amharic', hy: 'Armenian', az: 'Azerbaijani',
  be: 'Belarusian', bs: 'Bosnian', bg: 'Bulgarian', my: 'Burmese',
  hr: 'Croatian', et: 'Estonian', ka: 'Georgian', is: 'Icelandic',
  ga: 'Irish', kk: 'Kazakh', km: 'Khmer', lo: 'Lao',
  lv: 'Latvian', lt: 'Lithuanian', mk: 'Macedonian', mt: 'Maltese',
  mn: 'Mongolian', ne: 'Nepali', ps: 'Pashto', sr: 'Serbian',
  si: 'Sinhala', sk: 'Slovak', sl: 'Slovenian', so: 'Somali',
  tl: 'Tagalog', uz: 'Uzbek', cy: 'Welsh', yo: 'Yoruba',
  zu: 'Zulu', la: 'Latin', eo: 'Esperanto',
};

/** Get the English name for a language code. */
export function languageNameFromCode(code: string): string {
  return LANGUAGE_NAMES[code] ?? code.toUpperCase();
}

/** RTL languages. */
const RTL_LANGUAGES = new Set([
  'ar', 'he', 'fa', 'ur', 'ps', 'sd', 'yi', 'ku',
]);

export function isRTL(code: string): boolean {
  return RTL_LANGUAGES.has(code.split('-')[0]!);
}

export function getLanguageDirection(code: string): 'ltr' | 'rtl' {
  return isRTL(code) ? 'rtl' : 'ltr';
}
