import { useMemo } from 'react';
import type { DictionaryEntry } from '@langplayer/shared';

/**
 * Generate search terms for the /subs-search endpoint from a dictionary entry.
 * 
 * For now, uses head + alternate script. In the future, this can call the
 * /inflect-{l2} endpoints for full form expansion (like Next.js).
 */
export function useInflectedSearchTerms(entry: DictionaryEntry | null, _l2Code: string) {
  return useMemo(() => {
    if (!entry) return { allTerms: [] as string[], headTerm: '', formCount: 0 };

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
