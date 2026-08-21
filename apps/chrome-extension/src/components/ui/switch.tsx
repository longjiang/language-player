import React from 'react';

export function Switch({ checked, onCheckedChange, disabled = false, ariaLabel }: { checked: boolean; onCheckedChange: (checked: boolean) => void; disabled?: boolean; ariaLabel: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      className={`lpv-ui-switch ${checked ? 'is-checked' : ''}`}
      onClick={() => onCheckedChange(!checked)}
    >
      <span className="lpv-ui-switch-thumb" />
    </button>
  );
}
