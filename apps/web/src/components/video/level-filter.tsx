'use client';

import { useMemo } from 'react';
import { useT } from '@/hooks/use-t';
import { formatNumericLevel, primaryScale } from '@langplayer/shared';
import { levelPillClass } from '@/lib/level-colors';

interface LevelFilterProps {
  selected: number | undefined;
  onChange: (level: number | undefined) => void;
  /** ISO 639-1 language code for language-specific level labels (HSK, JLPT, etc.) */
  l2Code?: string;
}

export function LevelFilter({ selected, onChange, l2Code }: LevelFilterProps) {
  const t = useT();
  const scale = l2Code ? primaryScale(l2Code) : 'cefr';

  const levels = useMemo(
    () => [
      { value: undefined, label: t('filter.all'), colorClass: '' },
      { value: 1, label: formatNumericLevel(1, scale).short, colorClass: levelPillClass(1) },
      { value: 2, label: formatNumericLevel(2, scale).short, colorClass: levelPillClass(2) },
      { value: 3, label: formatNumericLevel(3, scale).short, colorClass: levelPillClass(3) },
      { value: 4, label: formatNumericLevel(4, scale).short, colorClass: levelPillClass(4) },
      { value: 5, label: formatNumericLevel(5, scale).short, colorClass: levelPillClass(5) },
      { value: 6, label: formatNumericLevel(6, scale).short, colorClass: levelPillClass(6) },
      { value: 7, label: formatNumericLevel(7, scale).short, colorClass: levelPillClass(7) },
    ],
    [scale, t],
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      {levels.map(({ value, label, colorClass }) => {
        const isSelected = selected === value;

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

