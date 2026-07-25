// @/src/i18n/load-messages.ts
// Dynamically loads locale messages in nested format from shared directory.
// Both i18n-js and react-intl (via resolveNested) read the same JSON files.

// Map of locale code → require() the JSON from packages/shared/locales/
const localeLoaders: Record<string, () => Record<string, unknown>> = {
  en: () => require('../../../../packages/shared/locales/en.json'),
  'zh-Hans': () => require('../../../../packages/shared/locales/zh-Hans.json'),
  'zh-Hant': () => require('../../../../packages/shared/locales/zh-Hant.json'),
  af: () => require('../../../../packages/shared/locales/af.json'),
  ar: () => require('../../../../packages/shared/locales/ar.json'),
  ca: () => require('../../../../packages/shared/locales/ca.json'),
  de: () => require('../../../../packages/shared/locales/de.json'),
  el: () => require('../../../../packages/shared/locales/el.json'),
  es: () => require('../../../../packages/shared/locales/es.json'),
  fi: () => require('../../../../packages/shared/locales/fi.json'),
  fr: () => require('../../../../packages/shared/locales/fr.json'),
  ga: () => require('../../../../packages/shared/locales/ga.json'),
  hi: () => require('../../../../packages/shared/locales/hi.json'),
  hr: () => require('../../../../packages/shared/locales/hr.json'),
  hu: () => require('../../../../packages/shared/locales/hu.json'),
  id: () => require('../../../../packages/shared/locales/id.json'),
  it: () => require('../../../../packages/shared/locales/it.json'),
  ja: () => require('../../../../packages/shared/locales/ja.json'),
  ko: () => require('../../../../packages/shared/locales/ko.json'),
  nl: () => require('../../../../packages/shared/locales/nl.json'),
  no: () => require('../../../../packages/shared/locales/no.json'),
  pl: () => require('../../../../packages/shared/locales/pl.json'),
  pt: () => require('../../../../packages/shared/locales/pt.json'),
  ro: () => require('../../../../packages/shared/locales/ro.json'),
  ru: () => require('../../../../packages/shared/locales/ru.json'),
  sr: () => require('../../../../packages/shared/locales/sr.json'),
  sv: () => require('../../../../packages/shared/locales/sv.json'),
  sw: () => require('../../../../packages/shared/locales/sw.json'),
  th: () => require('../../../../packages/shared/locales/th.json'),
  tr: () => require('../../../../packages/shared/locales/tr.json'),
  vi: () => require('../../../../packages/shared/locales/vi.json'),
};

// Module-level cache — ensures same reference for same locale (critical for useCallback stability)
const messageCache = new Map<string, Record<string, unknown>>();

/** Load messages for the given locale in nested format. Falls back to English. */
export function loadLocaleMessages(locale: string): Record<string, unknown> {
  const cached = messageCache.get(locale);
  if (cached) return cached;

  const loader = localeLoaders[locale] ?? localeLoaders['en'];
  const nested = loader();

  // Strip the "key" metadata field (artifact from GO's old csv_to_json.py).
  // e.g., { "key": "en", "action": { "cancel": "Cancel" } } → { "action": { "cancel": "Cancel" } }
  const { key, ...messages } = nested;

  const result = messages as Record<string, unknown>;
  messageCache.set(locale, result);
  return result;
}
