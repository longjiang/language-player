/**
 * Level mapping — 7-level proficiency scale to exam frameworks.
 *
 * Ported from Classic's lib/utils/language-levels.js and
 * the Python server's level_mapping.py.
 *
 * Level 1 = most common words / complete beginner
 * Level 7 = rarest words / near-native
 *
 * Functions are re-exported from @langplayer/shared (centralized in levels.ts).
 * The LEVELS constant remains here for UI components that need cross-scale lookup
 * (category, hoursMultiplier) in one table.
 */

import { primaryScale, formatNumericLevel } from '@langplayer/shared';

export { primaryScale, formatNumericLevel, LEVEL_HEX_COLORS, SCALES } from '@langplayer/shared';

export const LEVELS: Record<number, {
  hsk: string;
  cefr: string;
  jlpt: string | null;
  topik: string;
  ielts: string;
  category: string;
  hoursMultiplier: number;
}> = {
  1: { hsk: '1', cefr: 'Pre-A1', jlpt: 'Pre-N5', topik: 'Pre-1', ielts: '1', category: 'Beginner I', hoursMultiplier: 1 / 16 },
  2: { hsk: '2', cefr: 'A1', jlpt: 'N5', topik: '1', ielts: '2', category: 'Beginner II', hoursMultiplier: 1 / 16 },
  3: { hsk: '3', cefr: 'A2', jlpt: 'N4', topik: '2', ielts: '3.5', category: 'Beginner III', hoursMultiplier: 1 / 8 },
  4: { hsk: '4', cefr: 'B1', jlpt: 'N3', topik: '3', ielts: '5', category: 'Intermediate I', hoursMultiplier: 1 / 4 },
  5: { hsk: '5', cefr: 'B2', jlpt: 'N2', topik: '4', ielts: '6.5', category: 'Intermediate II', hoursMultiplier: 1 / 2 },
  6: { hsk: '6', cefr: 'C1', jlpt: 'N1', topik: '5', ielts: '8', category: 'Advanced I', hoursMultiplier: 1 },
  7: { hsk: '7-9', cefr: 'C2', jlpt: null, topik: '6', ielts: '9', category: 'Advanced II', hoursMultiplier: 2 },
};

/** @deprecated Use `primaryScale(l2Code)` from @langplayer/shared instead. */
export function examKey(l2Code: string): ReturnType<typeof primaryScale> {
  return primaryScale(l2Code);
}

/** @deprecated Use `formatNumericLevel(level, primaryScale(l2Code)).short` from @langplayer/shared instead. */
export function levelLabel(l2Code: string, level: number): string {
  return formatNumericLevel(level, primaryScale(l2Code)).short;
}
