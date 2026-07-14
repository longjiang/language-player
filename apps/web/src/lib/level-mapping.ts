/**
 * Level mapping — 7-level proficiency scale to exam frameworks.
 *
 * Ported from Classic's lib/utils/language-levels.js and
 * the Python server's level_mapping.py.
 *
 * Level 1 = most common words / complete beginner
 * Level 7 = rarest words / near-native
 */

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

/** Return the primary exam framework for a language code. */
export function examKey(l2Code: string): 'hsk' | 'jlpt' | 'topik' | 'ielts' | 'cefr' {
  if (l2Code === 'zh') return 'hsk';
  if (l2Code === 'ja') return 'jlpt';
  if (l2Code === 'ko') return 'topik';
  if (l2Code === 'en') return 'ielts';
  return 'cefr';
}

/** Return a human-readable level label like "HSK 3" or "CEFR A2". */
export function levelLabel(l2Code: string, level: number): string {
  const info = LEVELS[level];
  if (!info) return `Level ${level}`;
  const key = examKey(l2Code);
  const value = info[key as keyof typeof info];
  return value ? `${key.toUpperCase()} ${value}` : info.category;
}
