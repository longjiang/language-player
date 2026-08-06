'use client';

import { useState } from 'react';
import type { SketchCollocationsResponse } from '@langplayer/shared';
import { useT } from '@/hooks/use-t';
import { baseCode } from '@/lib/language-data';
import { PYTHON_API_URL } from '@/lib/api-url';
import { Loader2, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { useCorpusFetch } from './use-corpus-fetch';
import { CorpusFooter } from './corpus-footer';
import { HighlightTerm } from './highlight-term';

interface CollocationsProps {
  word: string;
  l2Code: string;
}

/** Words shown per grammatical-relation group before the user expands it. */
const DEFAULT_VISIBLE = 3;

/**
 * Word sketch — collocations grouped by grammatical relation.
 * GET /sketch-engine/collocations?word=&l2=  (ARCH-020 §7.1)
 */
export function Collocations({ word, l2Code }: CollocationsProps) {
  const t = useT();
  /** Gramrel indices the user has expanded to see all their collocations. */
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const url = `${PYTHON_API_URL}/sketch-engine/collocations?word=${encodeURIComponent(word)}&l2=${baseCode(l2Code)}`;
  const { data, loading, error } = useCorpusFetch<SketchCollocationsResponse>(url);

  const toggleExpanded = (gramrelIndex: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(gramrelIndex)) next.delete(gramrelIndex);
      else next.add(gramrelIndex);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
        <AlertCircle className="h-4 w-4 flex-shrink-0" />
        {t('error.failed_to_load', { status: error })}
      </div>
    );
  }

  if (!data || data.gramrels.length === 0) {
    return (
      <>
        <p className="py-6 text-center text-sm text-muted-foreground">
          {t('msg.no_collocations_found', { term: word })}
        </p>
        <CorpusFooter corpname={data?.corpname} />
      </>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {data.gramrels.map((gramrel, gramrelIndex) => {
          // Some gramrels contain null cm/word tokens (ARCH-020 §9) — drop
          // them so they never render as empty pills or collide on keys.
          const words = (gramrel.words || []).filter((w) => w.cm || w.word);
          if (words.length === 0) return null;

          const isExpanded = expanded.has(gramrelIndex);
          const visibleWords = isExpanded ? words : words.slice(0, DEFAULT_VISIBLE);
          const hiddenCount = words.length - DEFAULT_VISIBLE;

          return (
            <div
              key={gramrel.name || gramrelIndex}
              className="rounded-lg border border-border bg-muted/30 p-3"
            >
              <h4 className="mb-2 text-sm font-semibold text-foreground">
                {gramrel.description.replace(/{word}/g, word)}
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {visibleWords.map((w, wordIndex) => (
                  <span
                    key={`${gramrel.name || gramrelIndex}-${w.word || w.cm || wordIndex}`}
                    lang={baseCode(l2Code)}
                    className="inline-flex items-center rounded-full border border-border bg-background px-2.5 py-1 text-sm text-foreground"
                  >
                    <HighlightTerm text={w.cm || w.word} term={word} />
                  </span>
                ))}
              </div>
              {hiddenCount > 0 && (
                <button
                  type="button"
                  onClick={() => toggleExpanded(gramrelIndex)}
                  className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary transition-colors hover:underline"
                >
                  {isExpanded ? (
                    <>
                      <ChevronUp className="h-3.5 w-3.5" />
                      {t('action.show_less')}
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-3.5 w-3.5" />
                      {t('action.show_more')}
                      <span className="text-muted-foreground">({hiddenCount})</span>
                    </>
                  )}
                </button>
              )}
            </div>
          );
        })}
      </div>
      <CorpusFooter corpname={data.corpname} />
    </>
  );
}
