'use client';

import { useMemo } from 'react';
import { LEVELS } from '@/lib/level-mapping';
import { useT } from '@/hooks/use-t';
import { ChevronDown } from 'lucide-react';

interface LanguageLevelSelectProps {
  l2Code: string;
  value: number | undefined;
  onChange: (level: number) => void;
}

/**
 * Returns the primary exam framework for a language code.
 * Matches Classic's l2LevelKey() logic.
 */
function examKey(l2Code: string): 'hsk' | 'jlpt' | 'topik' | 'ielts' | 'cefr' {
  if (l2Code === 'zh') return 'hsk';
  if (l2Code === 'ja') return 'jlpt';
  if (l2Code === 'ko') return 'topik';
  if (l2Code === 'en') return 'ielts';
  return 'cefr';
}

function examName(l2Code: string, t: (key: string) => string): string {
  const map: Record<string, string> = {
    hsk: 'level.exam_hsk',
    jlpt: 'level.exam_jlpt',
    topik: 'level.exam_topik',
    ielts: 'level.exam_ielts',
    cefr: 'level.exam_cefr',
  };
  return t(map[examKey(l2Code)] ?? 'level.exam_cefr');
}

/**
 * Dropdown for selecting the user's language proficiency level.
 *
 * Renders exam-specific labels:
 *   Chinese → "HSK 3 — Beginner III"
 *   Japanese → "JLPT N4 — Beginner III"
 *   Korean → "TOPIK 2 — Beginner III"
 *   Others → "CEFR A2 — Beginner III"
 */
export function LanguageLevelSelect({ l2Code, value, onChange }: LanguageLevelSelectProps) {
  const t = useT();
  const key = examKey(l2Code);

  const options = useMemo(() => {
    return Object.entries(LEVELS).map(([numericStr, info]) => {
      const numeric = Number(numericStr);
      const examValue = info[key as keyof typeof info];
      const label = examValue
        ? `${examName(l2Code, t)} ${examValue} — ${info.category}`
        : `${info.category}`;
      return { value: numeric, label };
    });
  }, [key, l2Code, t]);

  return (
    <div className="relative">
      <select
        value={value ?? ''}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (v >= 1 && v <= 7) onChange(v);
        }}
        className="w-full appearance-none rounded-lg border border-border bg-card px-3 py-2 pr-8 text-sm text-foreground transition-colors hover:border-primary/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
      >
        <option value="" disabled>
          Select your level...
        </option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}
