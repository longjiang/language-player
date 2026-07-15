'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/providers/language-provider';
import {
  SUPPORTED_L1S,
  SUPPORTED_L2S,
} from '@langplayer/shared';
import {
  POPULAR_LANGUAGES,
  languageName,
} from '@/lib/language-data';
import { ChevronDown, ArrowRightLeft, Search } from 'lucide-react';

function useLanguageList(
  allCodes: readonly string[],
  search: string,
): { popular: string[]; rest: string[] } {
  return useMemo(() => {
    const q = search.toLowerCase();
    if (q) {
      // When searching, return flat filtered list as "popular" (no sections)
      const filtered = allCodes.filter(
        (c) =>
          languageName(c).toLowerCase().includes(q) || c.toLowerCase().includes(q),
      );
      return { popular: filtered, rest: [] };
    }
    // Popular first, then the rest
    const popularSet = new Set(POPULAR_LANGUAGES);
    const popular = POPULAR_LANGUAGES.filter((c) => allCodes.includes(c as any));
    const rest = allCodes.filter((c) => !popularSet.has(c as any));
    return { popular, rest: rest as string[] };
  }, [allCodes, search]);
}

export function LanguageSwitcher() {
  const { l1, l2, setLanguagePair } = useLanguage();
  const [open, setOpen] = useState<'l1' | 'l2' | null>(null);
  const [search, setSearch] = useState('');

  const l1List = useLanguageList(SUPPORTED_L1S, open === 'l1' ? search : '');
  const l2List = useLanguageList(SUPPORTED_L2S, open === 'l2' ? search : '');

  function openDropdown(which: 'l1' | 'l2') {
    setSearch('');
    setOpen(open === which ? null : which);
  }

  function selectL1(code: string) {
    setLanguagePair(code, l2.code);
    setOpen(null);
  }

  function selectL2(code: string) {
    setLanguagePair(l1.code, code);
    setOpen(null);
  }

  function swap() {
    if (SUPPORTED_L1S.includes(l2.code as any)) {
      setLanguagePair(l2.code, l1.code);
    }
  }

  function renderDropdown(
    list: { popular: string[]; rest: string[] },
    selected: string,
    onSelect: (code: string) => void,
    variant: 'l1' | 'l2',
    side: 'left' | 'right',
    nameFn: (code: string) => string,
  ) {
    const activeClass =
      variant === 'l1'
        ? 'bg-primary/10 font-medium text-primary'
        : 'bg-warm-500/10 font-medium text-warm-600 dark:text-warm-400';

    return (
      <div
        className={`absolute ${side === 'left' ? 'left-0' : 'right-0'} top-full z-50 mt-1 w-44 rounded-lg border border-border bg-popover p-1 shadow-lg`}
      >
        {/* Search input */}
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            autoFocus
            className="w-full rounded-md border border-input bg-background py-1.5 pl-7 pr-2 text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring/20"
          />
        </div>

        <div className="mt-1 max-h-64 overflow-y-auto">
          {/* Popular section */}
          {list.popular.length > 0 && (
            <div>
              {!search && (
                <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Popular
                </div>
              )}
              {list.popular.map((code) => (
                <button
                  key={code}
                  onClick={() => onSelect(code)}
                  className={`w-full rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted ${
                    code === selected ? activeClass : ''
                  }`}
                >
                  {nameFn(code)}
                </button>
              ))}
            </div>
          )}

          {/* Separator + rest */}
          {list.rest.length > 0 && (
            <>
              <div className="mx-1 my-1 border-t border-border" />
              <div>
                <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  All Languages
                </div>
                {list.rest.map((code) => (
                  <button
                    key={code}
                    onClick={() => onSelect(code)}
                    className={`w-full rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted ${
                      code === selected ? activeClass : ''
                    }`}
                  >
                    {nameFn(code)}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      {/* L1 (native) */}
      <div className="relative">
        <button
          onClick={() => openDropdown('l1')}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
        >
          {languageName(l1.code)}
          <ChevronDown className="h-3 w-3" />
        </button>
        {open === 'l1' && renderDropdown(l1List, l1.code, selectL1, 'l1', 'left', (c) => languageName(c))}
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
          onClick={() => openDropdown('l2')}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
        >
          {languageName(l2.code, l1.code)}
          <ChevronDown className="h-3 w-3" />
        </button>
        {open === 'l2' && renderDropdown(l2List, l2.code, selectL2, 'l2', 'right', (c) => languageName(c, l1.code))}
      </div>
    </div>
  );
}
