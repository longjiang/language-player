import type { LemmatizedToken } from '@langplayer/shared';
import { getCachedEntries } from './dictionary-cache';
import { baseCode } from './language';

/**
 * Phonetics decision — the single pipeline rule shared by every tokenized-text
 * surface (the video transcript TokenSpan, the page tokenizer, and any future
 * surface). Keeping it here means the "Show scope: All words / Hard words only"
 * setting can never drift between surfaces.
 *
 * The gate depends on the shared dictionary cache (`getCachedEntries`), which is
 * populated lazily by `enqueueLookupWords` / `bulkLookupWords`. When the scope is
 * "hard" and a word has not been looked up yet, `shouldShowPhonetics` returns
 * false — callers subscribe to the cache (`subscribeToCache`) and re-evaluate
 * once the lazy batch lookup lands, so hard words are revealed without a
 * non-lazy pass over the page.
 */

export type WordDifficulty =
  | { kind: 'not_cached' }
  | { kind: 'unclassified' }
  | { kind: 'classified'; value: number };

/** Get the lowest (easiest) difficulty value for a word from its cached
 *  dictionary entries. Checks both `levels[].numeric` and `frequencyLevel`,
 *  returns the minimum. Mirrors apps/web `token-span.tsx` getWordDifficulty.
 *
 *  `not_cached`  — no entry in cache yet (bulk lookup still pending).
 *  `unclassified`— cached entry exists but has no levels/frequency → unknown,
 *                  treat as hard (show phonetics).
 *  `classified`  — at least one numeric or frequency value found. */
export function getWordDifficulty(
  l2Code: string,
  lemmas: LemmatizedToken['lemmas'],
): WordDifficulty {
  const base = baseCode(l2Code);
  let hasEntry = false;
  let lowest: number | null = null;
  for (const lemma of lemmas) {
    const entries = getCachedEntries(base, lemma.lemma);
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

export interface PhoneticsGateInput {
  /** Phonetics on/off (settings "Show phonetics" toggle). */
  phoneticsOn: boolean;
  /** Display scope: 'all' (All words) or 'hard' (Hard words only). */
  scope: 'all' | 'hard';
  /** Learner's proficiency level (1–7); 0/undefined = not set → show all. */
  userLevel?: number;
  l2Code: string;
  lemmas: LemmatizedToken['lemmas'];
}

/** Whether phonetics should render for a single token, under the current
 *  Display settings. Not memoized on purpose: the dictionary cache fills
 *  asynchronously, so callers re-run this on cache-update re-renders. */
export function shouldShowPhonetics(input: PhoneticsGateInput): boolean {
  if (!input.phoneticsOn) return false;
  if (input.scope !== 'hard') return true;
  if (!input.userLevel || input.userLevel < 1) return true; // no level → show all
  const diff = getWordDifficulty(input.l2Code, input.lemmas);
  if (diff.kind === 'not_cached') return false; // wait for the lookup
  if (diff.kind === 'unclassified') return true; // unknown → treat as hard
  return diff.value >= input.userLevel;
}
