// @/src/language-levels

import { LEVELS, L2_LEVEL_6_HOURS, LevelInfo } from '@/constants/LanguageLevels';
import { MAX_DIFFICULTY_BY_LEVEL } from '@/constants/MaxDifficultyByLevel';

interface LevelDetails {
  level: number;
  l2Code: string;
  levelCategory: string;
  levelName: string;
  examName: string;
  examKey: string;
  examLevelName: string;
  hoursToComplete: number;
  maxDifficulty: number;
}

export function languageLevelsByL2Code(l2Code: string): Record<number, LevelDetails> {
  const examType = l2LevelKey(l2Code);
  const examName = l2LevelName(l2Code);
  const levels = LEVELS;
  const difficulties = MAX_DIFFICULTY_BY_LEVEL[l2Code] || [];

  const result: Record<number, LevelDetails> = {};

  Object.keys(levels).forEach(level => {
    const levelNum = parseInt(level);
    const levelInfo = levels[levelNum];
    const examLevelName = levelInfo[examType];
    const hoursMultiplier = levelInfo.hoursMultiplier;
    const maxDifficulty = difficulties[levelNum - 1] || 0;

    result[levelNum] = {
      level: levelNum,
      l2Code: l2Code,
      levelCategory: levelInfo.category,
      levelName: levelInfo.name,
      examName: examName,
      examKey: examType,
      examLevelName: `${examName} ${examLevelName}`,
      hoursToComplete: calculateHoursToComplete(hoursMultiplier, l2Code),
      maxDifficulty
    };
  });

  return result;
}

function l2LevelKey(l2Code: string): string {
  switch (l2Code) {
    case 'zh': return 'hsk';
    case 'ko': return 'topik';
    case 'ja': return 'jlpt';
    case 'en': return 'ielts';
    default: return 'cefr';
  }
}

function l2LevelName(l2Code: string): string {
  return l2LevelKey(l2Code).toUpperCase();
}

function calculateHoursToComplete(multiplier: number, l2Code: string): number {
  // Default to 1100 hours, which is the average time to go from level 5 to 6 for most languages
  const baseHours = L2_LEVEL_6_HOURS[l2Code] || 1100;
  return Math.round(baseHours * multiplier);
}
