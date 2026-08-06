'use client';

import { isContinua, type SketchExamplesResponse } from '@langplayer/shared';
import { sentenceContaining } from '@langplayer/utils';
import { useT } from '@/hooks/use-t';
import { baseCode } from '@/lib/language-data';
import { PYTHON_API_URL } from '@/lib/api-url';
import { Loader2, AlertCircle } from 'lucide-react';
import { useCorpusFetch } from './use-corpus-fetch';
import { TokenizedText } from '@/components/tokenized-text';

interface CorpusExamplesProps {
  word: string;
  l2Code: string;
  l1Code?: string;
  /** Optional corpus override; null = let the backend auto-resolve. */
  corpname?: string | null;
  /** Word forms (head + variants + inflections) to highlight in each sentence. */
  highlightForms?: string[];
  /** Dictionary entry ids to highlight by identity (e.g. the entry being viewed). */
  highlightEntryIds?: string[];
}

/**
 * Example sentences (concordance) with optional parallel translation.
 * GET /sketch-engine/examples?word=&l2=&l1=  (ARCH-020 §7.2)
 */
export function CorpusExamples({ word, l2Code, l1Code = 'en', corpname = null, highlightForms = [], highlightEntryIds = [] }: CorpusExamplesProps) {
  const t = useT();
  const l2 = baseCode(l2Code);
  const corpnameParam = corpname ? `&corpname=${encodeURIComponent(corpname)}` : '';
  const url = `${PYTHON_API_URL}/sketch-engine/examples?word=${encodeURIComponent(word)}&l2=${l2}&l1=${baseCode(l1Code)}${corpnameParam}`;
  const { data, loading, error } = useCorpusFetch<SketchExamplesResponse>(url);

  // Continua languages (CJK, Thai, Khmer, Lao, Burmese, Tibetan, Japanese,
  // Vietnamese…) are written without spaces — Sketch Engine returns the
  // sentence with a space between every token, so strip them to read naturally.
  const stripSpaces = isContinua(l2);

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

  if (!data || data.examples.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        {t('msg.no_examples_found_corpus', { term: word })}
      </p>
    );
  }

  return (
    <>
      <ul className="divide-y divide-border">
        {data.examples.map((example, index) => {
          const sentence = stripSpaces ? example.l2.replace(/ /g, '') : example.l2;
          // Sketch Engine returns a short passage around the hit — truncate to
          // the sentence containing the word (or any of its inflected forms)
          // using Intl.Segmenter-based segmentation (sentenceContaining).
          let hitOffset = -1;
          const searchForms = highlightForms.length > 0 ? highlightForms : [word];
          for (const f of searchForms) {
            if (!f) continue;
            const i = sentence.indexOf(f);
            if (i !== -1 && (hitOffset === -1 || i < hitOffset)) hitOffset = i;
          }
          const display = hitOffset !== -1
            ? sentenceContaining(sentence, hitOffset, l2)
            : sentence;
          return (
            <li key={`${example.l2}-${index}`} className="py-3">
              <p lang={l2} className="text-sm leading-relaxed text-foreground">
                <TokenizedText
                  text={display}
                  l2Code={l2}
                  textScale={0}
                  leading="none"
                  highlightSaved={false}
                  highlightForms={highlightForms}
                  highlightEntryIds={highlightEntryIds}
                />
              </p>
              {example.l1 ? (
                <p lang={baseCode(l1Code)} className="mt-1 text-sm text-muted-foreground">
                  {example.l1}
                </p>
              ) : null}
              {example.ref ? (
                <p className="mt-1 text-xs text-muted-foreground/70">{example.ref}</p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </>
  );
}
