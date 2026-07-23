import enDocs from '../i18n/en.json';

export interface DocEntryI18n {
  slug: string;
  title: string;
  content: string;
}

/** Get doc entries for a given locale. Falls back to English. */
export function getDocsForLocale(locale: string): DocEntryI18n[] {
  // For now, only English is statically imported. Other locales
  // would need individual JSON imports (31 files = large bundle).
  // Future: switch to dynamic require or lazy loading per locale.
  return enDocs as DocEntryI18n[];
}
