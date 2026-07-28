'use client';

import { useMemo } from 'react';
import { LEVELS } from '@/lib/level-mapping';
import { primaryScale, getLevelLabelWithFallback } from '@langplayer/shared';
import { useT } from '@/hooks/use-t';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';

interface LanguageLevelSelectProps {
  l2Code: string;
  value: number | undefined;
  onChange: (level: number) => void;
}

/**
 * Dropdown for selecting the user's language proficiency level.
 *
 * Shows all 7 levels (1–7). When the language's primary exam scale does not
 * cover a level, it falls back to CEFR labels. For example:
 *   Chinese → "HSK 3 — Beginner III" / "CEFR C2 — Advanced II" (level 7)
 *   Japanese → "JLPT N4 — Beginner III" / "CEFR C2 — Advanced II" (level 7)
 *   Korean → "TOPIK 2 — Beginner III"
 *   Others → "CEFR A2 — Beginner III"
 */
export function LanguageLevelSelect({ l2Code, value, onChange }: LanguageLevelSelectProps) {
  const t = useT();
  const scaleId = primaryScale(l2Code);

  const options = useMemo(() => {
    return Object.entries(LEVELS).map(([numericStr, info]) => {
      const numeric = Number(numericStr);
      const { label: examLabel, prefix, sourceScaleId } = getLevelLabelWithFallback(
        numeric,
        scaleId,
      );
      const label = `${prefix} ${examLabel} — ${info.category}`;
      return { value: numeric, label };
    });
  }, [scaleId]);

  const currentLabel = options.find((o) => o.value === value)?.label;

  return (
    <Select
      value={value != null ? String(value) : undefined}
      onValueChange={(v) => {
        const num = Number(v);
        if (num >= 1 && num <= 7) onChange(num);
      }}
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Select your level...">
          {currentLabel}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt.value} value={String(opt.value)}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
