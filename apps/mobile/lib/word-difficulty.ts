/**
 * Word-difficulty helpers for the hardWords phonetics filter (mobile).
 * Extracted from components/TokenizedText.tsx (file-size refactor).
 */

import type { LemmatizedToken } from '@langplayer/shared';
import { getCachedEntries } from '@/lib/dictionary-cache';

export type WordDifficulty =
  | { kind: 'not_cached' }
  | { kind: 'unclassified' }
  | { kind: 'classified'; value: number };

/** Get the lowest difficulty value for a word from its cached dictionary entries.
 *  Checks both `levels[].numeric` and `frequencyLevel`, returns the minimum. */
export function getWordDifficulty(l2Code: string, lemmas: LemmatizedToken['lemmas']): WordDifficulty {
  let hasEntry = false;
  let lowest: number | null = null;
  for (const lemma of lemmas) {
    const entries = getCachedEntries(l2Code, lemma.lemma);
    if (!entries) continue;
    hasEntry = true;
    for (const entry of entries) {
      if (entry.levels) {
        for (const l of entry.levels) {
          if (typeof l.numeric === 'number' && l.numeric >= 1 && l.numeric <= 7) {
            if (lowest === null || l.numeric < lowest) lowest = l.numeric;
          }
        }
      }
      if (typeof entry.frequencyLevel === 'number' && entry.frequencyLevel >= 1 && entry.frequencyLevel <= 7) {
        if (lowest === null || entry.frequencyLevel < lowest) lowest = entry.frequencyLevel;
      }
    }
  }
  if (!hasEntry) return { kind: 'not_cached' };
  if (lowest === null) return { kind: 'unclassified' };
  return { kind: 'classified', value: lowest };
}
