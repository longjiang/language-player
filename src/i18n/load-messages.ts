// @/src/i18n/load-messages.ts
// Dynamically loads locale messages in nested format.
// The source JSONs use nested format (compatible with both i18n-js and react-intl
// via the resolveNested() bridge in use-t.ts).

// Map of locale code → require() the JSON
// These are the same JSON files used by i18n-js (nested format).
// In Phase 2, these paths change to @langplayer/shared/locales/.
const localeLoaders: Record<string, () => Record<string, unknown>> = {
  en: () => require('@/assets/localizations/en.json'),
  'zh-Hans': () => require('@/assets/localizations/zh-Hans.json'),
  'zh-Hant': () => require('@/assets/localizations/zh-Hant.json'),
  af: () => require('@/assets/localizations/af.json'),
  ar: () => require('@/assets/localizations/ar.json'),
  ca: () => require('@/assets/localizations/ca.json'),
  de: () => require('@/assets/localizations/de.json'),
  el: () => require('@/assets/localizations/el.json'),
  es: () => require('@/assets/localizations/es.json'),
  fi: () => require('@/assets/localizations/fi.json'),
  fr: () => require('@/assets/localizations/fr.json'),
  ga: () => require('@/assets/localizations/ga.json'),
  hi: () => require('@/assets/localizations/hi.json'),
  hr: () => require('@/assets/localizations/hr.json'),
  hu: () => require('@/assets/localizations/hu.json'),
  id: () => require('@/assets/localizations/id.json'),
  it: () => require('@/assets/localizations/it.json'),
  ja: () => require('@/assets/localizations/ja.json'),
  ko: () => require('@/assets/localizations/ko.json'),
  nl: () => require('@/assets/localizations/nl.json'),
  no: () => require('@/assets/localizations/no.json'),
  pl: () => require('@/assets/localizations/pl.json'),
  pt: () => require('@/assets/localizations/pt.json'),
  ro: () => require('@/assets/localizations/ro.json'),
  ru: () => require('@/assets/localizations/ru.json'),
  sr: () => require('@/assets/localizations/sr.json'),
  sv: () => require('@/assets/localizations/sv.json'),
  sw: () => require('@/assets/localizations/sw.json'),
  th: () => require('@/assets/localizations/th.json'),
  tr: () => require('@/assets/localizations/tr.json'),
  vi: () => require('@/assets/localizations/vi.json'),
};

/** Load messages for the given locale in nested format. Falls back to English. */
export function loadLocaleMessages(locale: string): Record<string, unknown> {
  const loader = localeLoaders[locale] ?? localeLoaders['en'];
  const nested = loader();

  // Strip the "key" metadata field (artifact from GO's old csv_to_json.py).
  // e.g., { "key": "en", "action": { "cancel": "Cancel" } } → { "action": { "cancel": "Cancel" } }
  const { key, ...messages } = nested;

  return messages as Record<string, unknown>;
}
