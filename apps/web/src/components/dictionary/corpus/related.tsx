'use client';

import type { SketchThesaurusResponse } from '@langplayer/shared';
import { useT } from '@/hooks/use-t';
import { baseCode } from '@/lib/language-data';
import { PYTHON_API_URL } from '@/lib/api-url';
import { Loader2, AlertCircle } from 'lucide-react';
import { useCorpusFetch } from './use-corpus-fetch';
import { CorpusFooter } from './corpus-footer';

interface RelatedWordsProps {
  word: string;
  l2Code: string;
}

/**
 * Related words (thesaurus), sorted by similarity score.
 * GET /sketch-engine/thesaurus?word=&l2=  (ARCH-020 §7.3)
 */
export function RelatedWords({ word, l2Code }: RelatedWordsProps) {
  const t = useT();
  const url = `${PYTHON_API_URL}/sketch-engine/thesaurus?word=${encodeURIComponent(word)}&l2=${baseCode(l2Code)}`;
  const { data, loading, error } = useCorpusFetch<SketchThesaurusResponse>(url);

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

  if (!data || data.related.length === 0) {
    return (
      <>
        <p className="py-6 text-center text-sm text-muted-foreground">
          {t('msg.no_related_found', { term: word })}
        </p>
        <CorpusFooter corpname={data?.corpname} />
      </>
    );
  }

  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        {data.related
          .filter((related) => related.word)
          .map((related, index) => (
            <span
              key={`${related.word}-${index}`}
              lang={baseCode(l2Code)}
              className="inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-1 text-sm text-foreground"
            >
              {related.word}
            </span>
          ))}
      </div>
      <CorpusFooter corpname={data.corpname} />
    </>
  );
}
