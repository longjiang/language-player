'use client';

import { useMemo, useState } from 'react';
import { isContinua, type SketchCollocationsResponse } from '@langplayer/shared';
import { useT } from '@/hooks/use-t';
import { baseCode } from '@/lib/language-data';
import { PYTHON_API_URL } from '@/lib/api-url';
import { Loader2, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { useCorpusFetch } from './use-corpus-fetch';
import { useLazyTranslations } from '@/hooks/use-lazy-translations';
import { renderInlineMarkdown } from '@/components/text-action-panels';
import { TokenizedText } from '@/components/tokenized-text';

interface CollocationsProps {
  word: string;
  l2Code: string;
  /** ISO 639-1 code of the user's L1 (translation target). */
  l1Code?: string;
  /** Optional corpus override; null = let the backend auto-resolve. */
  corpname?: string | null;
  /** Word forms (head + variants + inflections) to highlight in each phrase. */
  highlightForms?: string[];
  /** Dictionary entry ids to highlight by identity (e.g. the entry being viewed). */
  highlightEntryIds?: string[];
}

/** Words shown per grammatical-relation group before the user expands it. */
const DEFAULT_VISIBLE = 3;

/**
 * Word sketch — collocations grouped by grammatical relation.
 * GET /sketch-engine/collocations?word=&l2=  (ARCH-020 §7.1)
 */
export function Collocations({ word, l2Code, l1Code = 'en', corpname = null, highlightForms = [], highlightEntryIds = [] }: CollocationsProps) {
  const t = useT();
  /** Gramrel indices the user has expanded to see all their collocations. */
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const corpnameParam = corpname ? `&corpname=${encodeURIComponent(corpname)}` : '';
  const url = `${PYTHON_API_URL}/sketch-engine/collocations?word=${encodeURIComponent(word)}&l2=${baseCode(l2Code)}${corpnameParam}`;
  const { data, loading, error } = useCorpusFetch<SketchCollocationsResponse>(url);

  // Continua languages (CJK, Thai, Khmer, Lao, Burmese, Tibetan, Japanese,
  // Vietnamese…) are written without spaces — collocation phrases come back
  // with a space between every token (e.g. `学习 知识`), so strip them too.
  const stripSpaces = isContinua(baseCode(l2Code));

  // Flat list of the collocation phrases actually rendered (respects the
  // per-gramrel "show more" expansion), plus each gramrel's start offset.
  const { flatTexts, startsByGramrel } = useMemo(() => {
    const texts: string[] = [];
    const starts: number[] = new Array(data?.gramrels.length ?? 0).fill(0);
    if (!data) return { flatTexts: [], startsByGramrel: [] };
    let running = 0;
    data.gramrels.forEach((gramrel, gramrelIndex) => {
      starts[gramrelIndex] = running;
      const words = (gramrel.words || []).filter((w) => w.cm || w.word);
      if (words.length === 0) return;
      const isExpanded = expanded.has(gramrelIndex);
      const visible = isExpanded ? words : words.slice(0, DEFAULT_VISIBLE);
      for (const w of visible) {
        const text = w.cm || w.word;
        texts.push(stripSpaces ? text.replace(/ /g, '') : text);
      }
      running += visible.length;
    });
    return { flatTexts: texts, startsByGramrel: starts };
  }, [data, expanded, stripSpaces]);

  // Send the full highlight-form list per line so the server bolds EVERY
  // inflected/discovered form that appears in the phrase's translation.
  const highlightTermForms = useMemo(
    () => flatTexts.map(() => highlightForms),
    [flatTexts, highlightForms],
  );
  const { translations, containerRef } = useLazyTranslations({
    texts: flatTexts,
    l1: baseCode(l1Code),
    l2: baseCode(l2Code),
    forms: highlightTermForms,
  });

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
      <p className="py-6 text-center text-sm text-muted-foreground">
        {t('msg.no_collocations_found', { term: word })}
      </p>
    );
  }

  return (
    <>
      {/* Two categories per row on sm+, single column on narrow screens. */}
      <div ref={containerRef} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {data.gramrels.map((gramrel, gramrelIndex) => {
          // Some gramrels contain null cm/word tokens (ARCH-020 §9) — drop
          // them so they never render as empty rows or collide on keys.
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
              <ul className="flex flex-col">
                {visibleWords.map((w, wordIndex) => {
                  const text = w.cm || w.word;
                  const display = stripSpaces ? text.replace(/ /g, '') : text;
                  const flatIdx = (startsByGramrel[gramrelIndex] ?? 0) + wordIndex;
                  const translation = translations[flatIdx];
                  return (
                    <li
                      key={`${gramrel.name || gramrelIndex}-${w.word || w.cm || wordIndex}-${wordIndex}`}
                      lang={baseCode(l2Code)}
                      className="rounded-md px-2 py-1 text-sm text-foreground transition-colors hover:bg-background"
                    >
                      <TokenizedText
                        text={display}
                        l2Code={l2Code}
                        // 1rem base, scaled by the user's zoom setting
                        textScale={1}
                        highlightSaved={false}
                        highlightForms={highlightForms}
                        highlightEntryIds={highlightEntryIds}
                      />
                      {translation ? (
                        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground/70">
                          {renderInlineMarkdown(translation, { markBold: true })}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
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
    </>
  );
}
