'use client';

import { useState } from 'react';
import { useT } from '@/hooks/use-t';
import { baseCode } from '@/lib/language-data';
import { cn } from '@/lib/utils';
import { Collocations } from './collocations';
import { CorpusExamples } from './examples';
import { RelatedWords } from './related';
import { Mistakes } from './mistakes';
import { CorpusFooter } from './corpus-footer';
import { useCorpora } from './use-corpora';

type CorpusPill = 'collocations' | 'examples' | 'related' | 'mistakes';

interface CorpusPanelProps {
  /** The word to look up in the corpus (the dictionary head form). */
  word: string;
  /** ISO 639-1 code of the target language. */
  l2Code: string;
  /** ISO 639-1 code of the user's L1 (used for parallel translations). */
  l1Code?: string;
}

/**
 * "Corpus" tab content: Sketch Engine corpus features (ARCH-020) behind four
 * pills — Collocations, Examples, Related, Mistakes. Mistakes only applies to
 * Chinese (l2 = zh) and is hidden for other languages.
 *
 * Sections stay mounted (hidden) once the panel opens, so each fetches exactly
 * once — matching the prefetch strategy used by the parent DictionaryEntryTabs.
 */
export function CorpusPanel({ word, l2Code, l1Code = 'en' }: CorpusPanelProps) {
  const t = useT();
  const showMistakes = baseCode(l2Code) === 'zh';
  const [active, setActive] = useState<CorpusPill>('collocations');
  /** Selected corpus; null = let the backend auto-resolve the default. */
  const [corpname, setCorpname] = useState<string | null>(null);
  const { corpora } = useCorpora(l2Code);

  const pills: { key: CorpusPill; label: string }[] = [
    { key: 'collocations', label: t('title.collocations') },
    { key: 'examples', label: t('title.examples') },
    { key: 'related', label: t('title.related') },
    ...(showMistakes ? [{ key: 'mistakes' as const, label: t('title.mistakes') }] : []),
  ];

  const pillClass = (isActive: boolean) =>
    cn(
      'rounded-full border px-3 py-1 text-xs transition-colors',
      isActive
        ? 'border-primary bg-primary text-primary-foreground'
        : 'border-border bg-muted text-muted-foreground hover:text-foreground',
    );

  return (
    <div>
      {/* Pills row */}
      <div className="mb-3 flex flex-nowrap items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {pills.map((pill) => (
          <button
            key={pill.key}
            type="button"
            onClick={() => setActive(pill.key)}
            aria-pressed={active === pill.key}
            className={cn(pillClass(active === pill.key), 'flex-shrink-0 whitespace-nowrap')}
          >
            {pill.label}
          </button>
        ))}
      </div>

      {/* Sections stay mounted so their fetches start when the panel opens */}
      <div className={active === 'collocations' ? '' : 'hidden'}>
        <Collocations word={word} l2Code={l2Code} corpname={corpname} />
      </div>
      <div className={active === 'examples' ? '' : 'hidden'}>
        <CorpusExamples word={word} l2Code={l2Code} l1Code={l1Code} corpname={corpname} />
      </div>
      <div className={active === 'related' ? '' : 'hidden'}>
        <RelatedWords word={word} l2Code={l2Code} corpname={corpname} />
      </div>
      {/* Mistakes always query the fixed guangwai learner corpus — the
          backend ignores corpname, so don't pass a selection. */}
      {showMistakes && (
        <div className={active === 'mistakes' ? '' : 'hidden'}>
          <Mistakes word={word} />
        </div>
      )}

      {/* Shared footer: attribution + corpus picker (re-queries all sections) */}
      <CorpusFooter corpora={corpora} corpname={corpname} onCorpnameChange={setCorpname} />
    </div>
  );
}
