import langNames from '../dist/lang-names.json';

const CSV_TO_CHROME_LOCALE: Record<string, string> = { 'zh-Hans': 'zh_CN', 'zh-Hant': 'zh_TW' };

export function languageName(code: string, l1Code = 'en'): string {
  const entry = (langNames as any)[code] || null;
  if (!entry) return (code || '').toUpperCase();
  const chromeLocale = CSV_TO_CHROME_LOCALE[l1Code] || l1Code;
  if (entry[chromeLocale]) return entry[chromeLocale];
  if (entry[l1Code]) return entry[l1Code];
  const bare = l1Code.replace(/[-_][A-Z]{2}$/i, '');
  if (bare !== l1Code && entry[bare]) return entry[bare];
  return entry.en || (code || '').toUpperCase();
}

export function nativeLanguageName(code: string): string {
  return languageName(code, code);
}
