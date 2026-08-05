import { useMemo } from 'react';
import type { DictionaryEntry } from '@langplayer/shared';
import { reduceSearchTerms, writtenFormVariants } from '@langplayer/utils';

/**
 * Generate search terms for the /subs-search endpoint from a dictionary entry.
 *
 * Written forms only: head, alternate script, kana reading for Japanese, and
 * simplified/traditional for Chinese. Pronunciation and phonetic_detail fields
 * are IPA/Latin phonetic guides that don't appear in subtitle text, so they
 * must never become search terms. Inflected forms aren't fetched on mobile
 * yet; when inflection expansion lands, feed them to reduceSearchTerms so the
 * same common-part reduction applies as on web.
 */
export function useInflectedSearchTerms(entry: DictionaryEntry | null, l2Code: string) {
  return useMemo(() => {
    if (!entry) return { allTerms: [] as string[], headTerm: '', formCount: 0 };

    const allTerms = reduceSearchTerms(entry.head, {
      variants: writtenFormVariants(entry, l2Code),
    });

    return {
      allTerms,
      headTerm: entry.head,
      formCount: allTerms.length,
    };
  }, [entry, l2Code]);
}
