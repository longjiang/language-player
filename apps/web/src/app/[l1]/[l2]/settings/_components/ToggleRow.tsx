'use client';

import { Switch } from '@/components/ui/switch';

interface ToggleRowProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function ToggleRow({ label, description, checked, onChange }: ToggleRowProps) {
  return (
    <div>
      <label className="flex items-center justify-between cursor-pointer">
        <div>
          <span className="text-sm font-medium">{label}</span>
          {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
        </div>
        <span className="shrink-0 ml-4">
          <Switch checked={checked} onCheckedChange={onChange} />
        </span>
      </label>
    </div>
  );
}
