'use client';

interface SliderRowProps {
  label: string;
  description?: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  leftLabel?: string;
  rightLabel?: string;
  centerLabel?: string;
  valueDisplay?: string;
}

export function SliderRow({
  label, description, min, max, step, value, onChange,
  leftLabel, rightLabel, centerLabel, valueDisplay,
}: SliderRowProps) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      {description && <p className="text-xs text-muted-foreground mb-3">{description}</p>}
      <div className="flex items-center gap-4">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="flex-1 h-2 rounded-full appearance-none bg-muted cursor-pointer
            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5
            [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:cursor-pointer"
        />
        <span className="w-10 text-center text-lg font-semibold tabular-nums">{valueDisplay ?? value}</span>
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-xs text-muted-foreground">{leftLabel ?? min}</span>
        {centerLabel && <span className="text-xs text-muted-foreground">{centerLabel}</span>}
        <span className="text-xs text-muted-foreground">{rightLabel ?? max}</span>
      </div>
    </div>
  );
}
