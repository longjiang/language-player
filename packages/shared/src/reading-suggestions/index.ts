import ja from './data/ja.json';
import type { ReadingSuggestions } from './types';
import { derivedWikipediaSuggestions } from './wiki';

export { READING_CATEGORIES } from './types';
export type {
  ReadingCategory,
  ReadingSuggestionItem,
  ReadingSuggestions,
} from './types';
export { wikipediaSubdomain } from './wiki';

/**
 * Curated per-language lists.
 *
 * Adding a language = drop in ./data/{code}.json and import it here. The
 * `satisfies` check makes a malformed JSON a typecheck error.
 */
const CURATED: Partial<Record<string, ReadingSuggestions>> = {
  ja: ja satisfies ReadingSuggestions,
};

/**
 * Loading logic: curated JSON wins for the current L2; languages without
 * curated content fall back to a derived Wikipedia suggestion so every
 * supported L2 still gets something to try.
 */
export function getReadingSuggestions(l2Code: string): ReadingSuggestions | null {
  return CURATED[l2Code] ?? derivedWikipediaSuggestions(l2Code);
}
