'use client';

import { Switch } from '@/components/ui/switch';

interface ToggleRowProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** When true, the row is muted and the toggle cannot be changed. */
  disabled?: boolean;
}

export function ToggleRow({ label, description, checked, onChange, disabled = false }: ToggleRowProps) {
  return (
    <div>
      <label className={`flex items-center justify-between ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
        <div>
          <span className="text-sm font-medium">{label}</span>
          {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
        </div>
        <span className="shrink-0 ml-4">
          <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
        </span>
      </label>
    </div>
  );
}
