'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useT } from '@/hooks/use-t';
import { SUPPORTED_L2S } from '@langplayer/shared';

/** Sentinel for "no language filter" (Radix Select forbids an empty value). */
const ALL = '__all__';

/**
 * The language (L2) picker every content screen filters by. `allowAll` adds an
 * "all languages" option for the cross-language listings; without it a
 * language must be chosen (the import and channels screens need one).
 */
export function L2Select({
  value,
  onChange,
  allowAll = false,
  className,
  id,
  disabled = false,
}: {
  value: string | null;
  onChange: (l2: string | null) => void;
  allowAll?: boolean;
  className?: string;
  id?: string;
  /** Locked while a discovery/add run is in flight (the L2 is its target). */
  disabled?: boolean;
}) {
  const t = useT();
  return (
    <Select
      value={value ?? (allowAll ? ALL : '')}
      onValueChange={(next) => onChange(next === ALL ? null : next)}
      disabled={disabled}
    >
      <SelectTrigger id={id} className={className ?? 'w-40'}>
        <SelectValue placeholder={t('label.language')} />
      </SelectTrigger>
      <SelectContent className="max-h-80">
        {allowAll && <SelectItem value={ALL}>{t('label.all_languages')}</SelectItem>}
        {SUPPORTED_L2S.map((code) => (
          <SelectItem key={code} value={code}>
            {code}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
