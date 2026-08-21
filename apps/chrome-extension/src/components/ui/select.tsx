import React from 'react';

export function Select({ value, onChange, options, ariaLabel }: { value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }>; ariaLabel: string }) {
  return (
    <select className="lpv-ui-select" value={value} aria-label={ariaLabel} onChange={(event) => onChange(event.target.value)}>
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  );
}
