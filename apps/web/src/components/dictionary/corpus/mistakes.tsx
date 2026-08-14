'use client';

import type { SketchMistakesResponse } from '@langplayer/shared';
import { useT } from '@/hooks/use-t';
import { PYTHON_API_URL } from '@/lib/api-url';
import { Loader2, AlertCircle } from 'lucide-react';
import { useCorpusFetch } from './use-corpus-fetch';
import { TokenizedText } from '@/components/tokenized-text';

interface MistakesProps {
  word: string;
  /** Word forms (head + script variants) to highlight in each sentence. */
  highlightForms?: string[];
  /** Dictionary entry ids to highlight by identity (e.g. the entry being viewed). */
  highlightEntryIds?: string[];
}

/**
 * Common Chinese learner mistakes (guangwai corpus).
 * GET /sketch-engine/mistakes?word=  (ARCH-020 §7.4)
 */
export function Mistakes({ word, highlightForms = [], highlightEntryIds = [] }: MistakesProps) {
  const t = useT();
  const url = `${PYTHON_API_URL}/sketch-engine/mistakes?word=${encodeURIComponent(word)}`;
  const { data, loading, error } = useCorpusFetch<SketchMistakesResponse>(url);

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

  if (!data || data.mistakes.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        {t('msg.no_mistakes_found', { term: word })}
      </p>
    );
  }

  return (
    <>
      <ul className="space-y-5">
        {data.mistakes.map((mistake, index) => {
          const country = mistake.country?.name ?? mistake.country?.code ?? '';
          const hasDescription =
            mistake.errorLevel || mistake.errorType || mistake.proficiency || country;
          return (
            <li key={`${mistake.text}-${index}`}>
              {mistake.leftContext ? (
                <p className="text-xs text-muted-foreground/70">{mistake.leftContext}</p>
              ) : null}
              <p lang="zh" className="mt-1 text-sm leading-relaxed">
                <TokenizedText
                  text={`${mistake.left ?? ''}${word}${mistake.right ?? ''}`}
                  l2Code="zh"
                  // 1rem base, scaled by the user's zoom setting
                  textScale={1}
                  highlightSaved={false}
                  highlightForms={highlightForms}
                  highlightEntryIds={highlightEntryIds}
                />
              </p>
              {mistake.rightContext ? (
                <p className="mt-1 text-xs text-muted-foreground/70">{mistake.rightContext}</p>
              ) : null}
              {hasDescription ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  {t('corpus.mistake_description', {
                    errorLevel: mistake.errorLevel ?? '',
                    errorType: mistake.errorType ?? '',
                    proficiency: mistake.proficiency ?? '',
                    country,
                  })}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </>
  );
}
