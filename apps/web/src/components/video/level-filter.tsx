'use client';

import { useMemo } from 'react';
import { useT } from '@/hooks/use-t';
import { formatNumericLevel, primaryScale } from '@langplayer/shared';
import { levelPillClass } from '@/lib/level-colors';

interface LevelFilterProps {
  selected: number | undefined;
  onChange: (level: number | undefined) => void;
  /** When the Kids pill is active, level is cleared (kids shows all levels).
   *  Kids and level pills are mutually exclusive. */
  kidsSelected?: boolean;
  onKidsChange?: (kids: boolean) => void;
  /** ISO 639-1 language code for language-specific level labels (HSK, JLPT, etc.) */
  l2Code?: string;
}

export function LevelFilter({ selected, onChange, kidsSelected = false, onKidsChange, l2Code }: LevelFilterProps) {
  const t = useT();
  const scale = l2Code ? primaryScale(l2Code) : 'cefr';

  const levels = useMemo(
    () => [
      { value: undefined, label: t('filter.all'), colorClass: '' },
      ...([1, 2, 3, 4, 5, 6, 7] as const).map((value) => ({
        value,
        label: formatNumericLevel(value, scale).short,
        colorClass: levelPillClass(value),
      })),
    ],
    [scale, t],
  );

  const kidsIsSelected = kidsSelected;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {levels.map(({ value, label, colorClass }) => {
        // When Kids is active, no level pill is selected (mutual exclusivity).
        const isSelected = !kidsSelected && selected === value;

        return (
          <button
            key={label}
            onClick={() => { onKidsChange?.(false); onChange(value); }}
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
      {onKidsChange && (
        <button
          onClick={() => { onKidsChange(true); onChange(undefined); }}
          data-state={kidsIsSelected ? 'on' : 'off'}
          className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-all ${
            kidsIsSelected
              ? levelPillClass(1) + ' shadow-sm'
              : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
          }`}
        >
          {t('filter.kids')}
        </button>
      )}
    </div>
  );
}

