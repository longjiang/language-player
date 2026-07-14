'use client';

import { useMemo } from 'react';
import { useT } from '@/hooks/use-t';
import { LEVELS, examKey } from '@/lib/level-mapping';
import { baseCode } from '@/lib/language-data';

interface LevelFilterProps {
  selected: number | undefined;
  onChange: (level: number | undefined) => void;
  /** ISO 639-1 language code for language-specific level labels (HSK, JLPT, etc.) */
  l2Code?: string;
}

const PILL_COLORS: Record<number, string> = {
  1: 'data-[state=on]:bg-emerald-500 data-[state=on]:text-white',
  2: 'data-[state=on]:bg-teal-500 data-[state=on]:text-white',
  3: 'data-[state=on]:bg-blue-500 data-[state=on]:text-white',
  4: 'data-[state=on]:bg-violet-500 data-[state=on]:text-white',
  5: 'data-[state=on]:bg-orange-500 data-[state=on]:text-white',
  6: 'data-[state=on]:bg-red-500 data-[state=on]:text-white',
  7: 'data-[state=on]:bg-rose-600 data-[state=on]:text-white',
};

const EXAM_NAMES: Record<string, string> = {
  hsk: 'HSK',
  jlpt: 'JLPT',
  topik: 'TOPIK',
  ielts: 'IELTS',
  cefr: 'CEFR',
};

/**
 * Returns a human-readable level label for a given numeric level (1-7).
 *
 * Language-specific mapping:
 *   Chinese  → HSK 1, HSK 2, ..., HSK 7-9
 *   Japanese → JLPT Pre-N5, N5, N4, ..., N1
 *   Korean   → TOPIK Pre-1, 1, 2, ..., 6
 *   English  → IELTS 1, 2, 3.5, ..., 9
 *   Others   → CEFR Pre-A1, A1, A2, ..., C2
 */
function getLevelLabel(l2Code: string | undefined, level: number): string {
  const info = LEVELS[level];
  if (!info) return `Level ${level}`;

  const key = l2Code ? examKey(baseCode(l2Code)) : 'cefr';
  const value = info[key as keyof typeof info];
  if (value) {
    const examName = EXAM_NAMES[key] ?? 'CEFR';
    return `${examName} ${value}`;
  }
  return info.cefr;
}

export function LevelFilter({ selected, onChange, l2Code }: LevelFilterProps) {
  const t = useT();

  const levels = useMemo(
    () => [
      { value: undefined, label: t('filter.all') },
      { value: 1, label: getLevelLabel(l2Code, 1) },
      { value: 2, label: getLevelLabel(l2Code, 2) },
      { value: 3, label: getLevelLabel(l2Code, 3) },
      { value: 4, label: getLevelLabel(l2Code, 4) },
      { value: 5, label: getLevelLabel(l2Code, 5) },
      { value: 6, label: getLevelLabel(l2Code, 6) },
      { value: 7, label: getLevelLabel(l2Code, 7) },
    ],
    [l2Code, t],
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      {levels.map(({ value, label }) => {
        const isSelected = selected === value;
        const colorClass = value ? PILL_COLORS[value] ?? '' : '';

        return (
          <button
            key={label}
            onClick={() => onChange(value)}
            data-state={isSelected ? 'on' : 'off'}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-all ${
              isSelected
                ? `${colorClass} shadow-sm`
                : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

