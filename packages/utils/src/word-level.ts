/**
 * Dictionary-entry difficulty levels (1–7), shared by every surface that
 * compares words by how common they are.
 *
 * An entry's level comes from either source, both normalized to the same 1–7
 * scale (`ProficiencyLevel.numeric`: 1 = most frequent/beginner, 7 = rarest):
 *
 *  - `frequencyLevel` — derived from the entry's Zipf frequency score
 *    (ARCH-004 § "Frequency → level"). `null` for languages whose words carry
 *    canonical exam levels instead, and for words with no frequency data.
 *  - `levels[].numeric` — canonical exam/CEFR levels (HSK, JLPT, TOPIK, IELTS,
 *    CEFR), normalized to 1–7 by `level_mapping.canonical_level_to_numeric`.
 *
 * The level of an entry is the **lowest** valid value across both sources —
 * the same derivation the phonetics gate ("Hard Words Only") already used, so
 * a word can never be "easy" for one surface and "hard" for another.
 *
 * Anything else (missing, null, 0, out of range, legacy strings) is
 * *unclassified*: the word cannot be placed on the frequency scale.
 */

import type { DictionaryEntry } from '@langplayer/shared';

/** Lowest proficiency level on the shared 1–7 scale (most frequent). */
export const MIN_WORD_LEVEL = 1;
/** Highest proficiency level on the shared 1–7 scale (rarest). */
export const MAX_WORD_LEVEL = 7;

/**
 * Minimal entry shape needed to derive a level. Both `DictionaryEntry` and the
 * cached/offline copies satisfy it, so callers never have to build a full entry.
 */
export type LevelBearingEntry = Pick<DictionaryEntry, 'levels' | 'frequencyLevel'>;

function validLevel(value: unknown): number | null {
  return typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= MIN_WORD_LEVEL &&
    value <= MAX_WORD_LEVEL
    ? value
    : null;
}

/** Lowest (most frequent) 1–7 level of one entry; `null` = unclassified. */
export function entryDifficultyLevel(entry: LevelBearingEntry): number | null {
  let lowest: number | null = null;
  for (const level of entry.levels ?? []) {
    const numeric = validLevel(level?.numeric);
    if (numeric !== null && (lowest === null || numeric < lowest)) lowest = numeric;
  }
  const freq = validLevel(entry.frequencyLevel);
  if (freq !== null && (lowest === null || freq < lowest)) lowest = freq;
  return lowest;
}

/**
 * Lowest level across several entries for the same word (a lookup can return
 * multiple senses/spellings). `null` when none of them is classified.
 */
export function lowestEntryLevel(
  entries: ReadonlyArray<LevelBearingEntry> | null | undefined,
): number | null {
  if (!entries || entries.length === 0) return null;
  let lowest: number | null = null;
  for (const entry of entries) {
    const level = entryDifficultyLevel(entry);
    if (level !== null && (lowest === null || level < lowest)) lowest = level;
  }
  return lowest;
}
