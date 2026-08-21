import React from 'react';

export function Slider({ value, min, max, step, onChange, ariaLabel }: { value: number; min: number; max: number; step: number; onChange: (value: number) => void; ariaLabel: string }) {
  return <input className="lpv-ui-slider" type="range" value={value} min={min} max={max} step={step} aria-label={ariaLabel} onChange={(event) => onChange(Number(event.target.value))} />;
}
