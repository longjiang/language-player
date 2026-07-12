'use client';

import { useT } from '@/hooks/use-t';

interface LevelFilterProps {
  selected: number | undefined;
  onChange: (level: number | undefined) => void;
}

const LEVEL_KEYS = [
  { value: undefined, key: 'filter.all' },
  { value: 1, key: 'filter.a1' },
  { value: 2, key: 'filter.a2' },
  { value: 3, key: 'filter.b1' },
  { value: 4, key: 'filter.b2' },
  { value: 5, key: 'filter.c1' },
  { value: 6, key: 'filter.c2' },
  { value: 7, key: 'filter.native' },
];

const PILL_COLORS: Record<number, string> = {
  1: 'data-[state=on]:bg-emerald-500 data-[state=on]:text-white',
  2: 'data-[state=on]:bg-teal-500 data-[state=on]:text-white',
  3: 'data-[state=on]:bg-blue-500 data-[state=on]:text-white',
  4: 'data-[state=on]:bg-violet-500 data-[state=on]:text-white',
  5: 'data-[state=on]:bg-orange-500 data-[state=on]:text-white',
  6: 'data-[state=on]:bg-red-500 data-[state=on]:text-white',
  7: 'data-[state=on]:bg-rose-600 data-[state=on]:text-white',
};

export function LevelFilter({ selected, onChange }: LevelFilterProps) {
  const t = useT();

  return (
    <div className="flex flex-wrap items-center gap-2">
      {LEVEL_KEYS.map(({ value, key }) => {
        const label = t(key);
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
