'use client';

interface SegmentedRowProps<T extends string | boolean> {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}

export function SegmentedRow<T extends string | boolean>({
  label, options, value, onChange,
}: SegmentedRowProps<T>) {
  return (
    <div>
      <label className="block text-sm font-medium mb-2">{label}</label>
      <div className="inline-flex rounded-lg border border-border bg-muted p-1">
        {options.map(opt => (
          <button
            key={String(opt.value)}
            onClick={() => onChange(opt.value)}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              value === opt.value
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
