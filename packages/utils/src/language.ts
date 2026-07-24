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

/** Strip BCP 47 subtags down to the ISO 639-1 primary language code.
 *  e.g. "zh-Hans" → "zh", "en-US" → "en", "ja" → "ja" */
export function baseCode(code: string): string {
  return code.split('-')[0]!;
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

/**
 * Languages whose native script is Latin or for which phonetics display
 * is intentionally suppressed. Burmese is excluded because its script is
 * complex to romanize reliably.
 */
const PHONETICS_SUPPRESSED = new Set([
  // Latin-script languages — already written in the learner's alphabet
  'en', 'fr', 'de', 'es', 'it', 'pt', 'nl', 'sv', 'no', 'da', 'fi',
  'tr', 'pl', 'cs', 'sk', 'hu', 'ro', 'hr', 'sl', 'lv', 'lt', 'et',
  'is', 'ga', 'cy', 'mt', 'eu', 'ca', 'gl', 'af', 'id', 'ms', 'vi',
  'tl', 'ceb', 'sw', 'zu', 'xh', 'ha', 'yo', 'ig', 'so', 'rw', 'ny',
  // Burmese — complex script, no reliable romanizer yet
  'my',
]);

/**
 * Returns true if the given language code is eligible for phonetics display
 * (ruby text, romanization, etc.). Returns false for Latin-script languages
 * (where the native script is already readable) and for Burmese.
 */
export function isPhoneticsEligible(l2Code: string): boolean {
  return !PHONETICS_SUPPRESSED.has(l2Code.split('-')[0]!);
}
