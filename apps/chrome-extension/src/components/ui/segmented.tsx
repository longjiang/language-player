import React from 'react';

interface SegmentedProps<T extends string | boolean> {
  label: string;
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
}

/**
 * Segmented button group — the web apps/web settings use SegmentedRow
 * (apps/web/src/app/[l1]/[l2]/settings/_components/SegmentedRow.tsx) in
 * place of a <select> dropdown for Theme / Font / Phonetics. This is the
 * extension-local Shadcn-compatible equivalent (ADR-0011 semantic tokens),
 * matching the web's segmented control structure and behaviour.
 */
export function Segmented<T extends string | boolean>({
  label,
  options,
  value,
  onChange,
  ariaLabel,
}: SegmentedProps<T>) {
  return (
    <div className="lpv-segmented">
      {label && <label className="lpv-segmented-label">{label}</label>}
      <div className="lpv-segmented-group" role="radiogroup" aria-label={ariaLabel ?? label} aria-orientation="horizontal">
        {options.map((opt) => (
          <button
            key={String(opt.value)}
            type="button"
            role="radio"
            aria-checked={value === opt.value}
            onClick={() => onChange(opt.value)}
            className={`lpv-segmented-option ${value === opt.value ? 'is-selected' : ''}`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
