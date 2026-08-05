import { useMemo } from 'react';
import type { DictionaryEntry } from '@langplayer/shared';

/**
 * Generate search terms for the /subs-search endpoint from a dictionary entry.
 *
 * Search terms are always WRITTEN forms (head + alternate script). Pronunciation
 * and phonetic_detail fields are IPA/Latin phonetic guides that don't appear in
 * subtitle text, so they must never become search terms. If inflection
 * expansion is added later, filter error rows (table === 'error') the same way
 * the web hook does.
 */
export function useInflectedSearchTerms(entry: DictionaryEntry | null, _l2Code: string) {
  return useMemo(() => {
    if (!entry) return { allTerms: [] as string[], headTerm: '', formCount: 0 };

    // Written forms only — no entry.pronunciation / entry.phonetic_detail.
    const terms: string[] = [entry.head];
    if (entry.alternate && entry.alternate !== entry.head) {
      terms.push(entry.alternate);
    }

    return {
      allTerms: terms,
      headTerm: entry.head,
      formCount: terms.length,
    };
  }, [entry]);
}
