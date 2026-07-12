'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/providers/language-provider';
import {
  SUPPORTED_L1S,
} from '@langplayer/shared';
import {
  POPULAR_LANGUAGES,
  languageName,
} from '@/lib/language-data';
import { ChevronDown, ArrowRightLeft } from 'lucide-react';

export function LanguageSwitcher() {
  const { l1, l2, setLanguagePair } = useLanguage();
  const [open, setOpen] = useState<'l1' | 'l2' | null>(null);

  const popular = POPULAR_LANGUAGES.filter((c) => SUPPORTED_L1S.includes(c as any));

  function swap() {
    // Swap L1 and L2 (useful for bidirectional learning)
    if (SUPPORTED_L1S.includes(l2.code as any)) {
      setLanguagePair(l2.code, l1.code);
    }
  }

  return (
    <div className="flex items-center gap-1">
      {/* L1 (native) */}
      <div className="relative">
        <button
          onClick={() => setOpen(open === 'l1' ? null : 'l1')}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
        >
          {languageName(l1.code)}
          <ChevronDown className="h-3 w-3" />
        </button>
        {open === 'l1' && (
          <div className="absolute left-0 top-full z-50 mt-1 max-h-48 w-40 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg">
            {popular.map((code) => (
              <button
                key={code}
                onClick={() => {
                  setLanguagePair(code, l2.code);
                  setOpen(null);
                }}
                className={`w-full rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted ${
                  code === l1.code ? 'bg-primary/10 font-medium text-primary' : ''
                }`}
              >
                {languageName(code)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Swap button */}
      <button
        onClick={swap}
        className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        title="Swap languages"
      >
        <ArrowRightLeft className="h-3.5 w-3.5" />
      </button>

      {/* L2 (learning) */}
      <div className="relative">
        <button
          onClick={() => setOpen(open === 'l2' ? null : 'l2')}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
        >
          {languageName(l2.code)}
          <ChevronDown className="h-3 w-3" />
        </button>
        {open === 'l2' && (
          <div className="absolute right-0 top-full z-50 mt-1 max-h-48 w-40 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg">
            {popular.map((code) => (
              <button
                key={code}
                onClick={() => {
                  setLanguagePair(l1.code, code);
                  setOpen(null);
                }}
                className={`w-full rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted ${
                  code === l2.code ? 'bg-warm-500/10 font-medium text-warm-600 dark:text-warm-400' : ''
                }`}
              >
                {languageName(code)}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
