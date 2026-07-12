'use client';

interface LevelFilterProps {
  selected: number | undefined;
  onChange: (level: number | undefined) => void;
}

const LEVELS = [
  { value: undefined, label: 'All' },
  { value: 1, label: 'A1' },
  { value: 2, label: 'A2' },
  { value: 3, label: 'B1' },
  { value: 4, label: 'B2' },
  { value: 5, label: 'C1' },
  { value: 6, label: 'C2' },
  { value: 7, label: 'Native' },
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
  return (
    <div className="flex flex-wrap items-center gap-2">
      {LEVELS.map(({ value, label }) => {
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
