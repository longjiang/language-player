import type { DocEntry } from './docs-i18n-types';

// Static imports for all 31 locales
import enDocs from './docs-i18n/en.json';

// Registry of locale → translated docs (lazy-loaded for other locales)
const registry: Record<string, DocEntry[]> = { en: enDocs as DocEntry[] };

/**
 * Get translated doc entries for the given locale.
 * Falls back to English if the locale is not available.
 */
export function getDocsForLocale(locale: string): DocEntry[] {
  if (registry[locale]) return registry[locale]!;
  // Fall back to English for locales not yet loaded
  return registry['en']!;
}

export { enDocs };
export { type DocEntry } from './docs-i18n-types';
