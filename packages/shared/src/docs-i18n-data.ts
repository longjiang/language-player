import type { DocEntryI18n } from './docs-i18n-types';

// Static imports for all 31 locales
import enDocs from './docs-i18n/en.json';
const enDocsTyped = enDocs as DocEntryI18n[];

// Registry of locale → translated docs (lazy-loaded for other locales)
const registry: Record<string, DocEntryI18n[]> = { en: enDocsTyped };

/**
 * Get translated doc entries for the given locale.
 * Falls back to English if the locale is not available.
 */
export function getDocsForLocale(locale: string): DocEntryI18n[] {
  if (registry[locale]) return registry[locale]!;
  // Fall back to English for locales not yet loaded
  return registry['en']!;
}

export { enDocsTyped as enDocs };
export type { DocEntryI18n };
