import React, { useMemo, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { Button, buttonTextClass } from '@/components/ui/button';
import { isContinua, type SketchCollocationsResponse } from '@langplayer/shared';
import { useT } from '@/hooks/use-t';
import { PYTHON_API_URL } from '@/lib/api-url';
import { ICON_MUTED } from '@/lib/theme-colors';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { ErrorNotice } from '@/components/ui/error-notice';
import { useCorpusFetch } from './use-corpus-fetch';
import { useCorpusTranslations } from './use-corpus-translations';
import { TokenizedText } from '@/components/TokenizedText';
import { TextActionMenu } from '@/components/TextActionMenu';
import { renderInlineMarkdown } from '@/lib/inline-markdown';

interface CollocationsProps {
  word: string;
  l2Code: string;
  /** ISO 639-1 code of the user's L1 (translation target). */
  l1Code?: string;
  /** Optional corpus override; null = let the backend auto-resolve. */
  corpname?: string | null;
  /** Word forms (head + variants + inflections) to highlight in each phrase. */
  highlightForms?: string[];
}

/** Words shown per grammatical-relation group before the user expands it. */
const DEFAULT_VISIBLE = 3;

/**
 * Word sketch — collocations grouped by grammatical relation.
 * GET /sketch-engine/collocations?word=&l2=  (ARCH-020 §7.1)
 */
export function Collocations({ word, l2Code, l1Code = 'en', corpname = null, highlightForms = [] }: CollocationsProps) {
  const t = useT();
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const corpnameParam = corpname ? `&corpname=${encodeURIComponent(corpname)}` : '';
  const url = `${PYTHON_API_URL}/sketch-engine/collocations?word=${encodeURIComponent(word)}&l2=${l2Code.split('-')[0]}${corpnameParam}`;
  const { data, loading, error } = useCorpusFetch<SketchCollocationsResponse>(url);

  const stripSpaces = isContinua(l2Code.split('-')[0]);

  // Flat list of collocation phrases (respects per-gramrel expansion) for
  // batch translation.
  const flatTexts = useMemo(() => {
    const texts: string[] = [];
    if (!data) return texts;
    data.gramrels.forEach((gramrel, gramrelIndex) => {
      const words = (gramrel.words || []).filter((w) => w.cm || w.word);
      if (words.length === 0) return;
      const isExpanded = expanded.has(gramrelIndex);
      const visible = isExpanded ? words : words.slice(0, DEFAULT_VISIBLE);
      for (const w of visible) {
        const text = w.cm || w.word;
        texts.push(stripSpaces ? text.replace(/ /g, '') : text);
      }
    });
    return texts;
  }, [data, expanded, stripSpaces]);

  const { translations } = useCorpusTranslations(
    flatTexts,
    l1Code.split('-')[0],
    l2Code.split('-')[0],
    flatTexts.map(() => highlightForms),
    visible,
  );

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
      <View className="items-center justify-center py-10">
        <ActivityIndicator size="large" color={ICON_MUTED} />
      </View>
    );
  }

  if (error) {
    return <ErrorNotice message={t('error.failed_to_load', { status: error })} />;
  }

  if (!data || data.gramrels.length === 0) {
    return (
      <Text className="py-6 text-center text-sm text-muted-foreground">
        {t('msg.no_collocations_found', { term: word })}
      </Text>
    );
  }

  return (
    <View className="gap-3" onLayout={() => setVisible(true)}>
      {data.gramrels.map((gramrel, gramrelIndex) => {
        const words = (gramrel.words || []).filter((w) => w.cm || w.word);
        if (words.length === 0) return null;

        const isExpanded = expanded.has(gramrelIndex);
        const visibleWords = isExpanded ? words : words.slice(0, DEFAULT_VISIBLE);
        const hiddenCount = words.length - DEFAULT_VISIBLE;
        let flatIdx = 0;
        for (let i = 0; i < gramrelIndex; i++) {
          const giWords = (data.gramrels[i]?.words || []).filter((w) => w.cm || w.word);
          flatIdx += expanded.has(i) ? giWords.length : Math.min(giWords.length, DEFAULT_VISIBLE);
        }

        return (
          <View key={gramrel.name || gramrelIndex} className="rounded-lg border border-border bg-muted/30 p-3">
            <Text className="mb-2 text-sm font-semibold text-foreground">
              {gramrel.description.replace(/{word}/g, word)}
            </Text>
            <View>
              {visibleWords.map((w, wordIndex) => {
                const text = w.cm || w.word;
                const display = stripSpaces ? text.replace(/ /g, '') : text;
                const translation = translations[flatIdx + wordIndex];
                return (
                  <View key={`${gramrel.name || gramrelIndex}-${w.word || w.cm || wordIndex}`} className="rounded-md px-2 py-1">
                    <TextActionMenu
                      className="w-full"
                      text={display}
                      l2Code={l2Code.split('-')[0]}
                      l1Code={l1Code.split('-')[0]}
                    >
                      <TokenizedText
                        text={display}
                        l2Code={l2Code}
                        highlightTerms={highlightForms}
                        textScale={1}
                      />
                    </TextActionMenu>
                    {translation ? (
                      <Text className="mt-0.5 text-xs leading-relaxed text-muted-foreground/70">
                        {renderInlineMarkdown(translation, { markBold: true })}
                      </Text>
                    ) : null}
                  </View>
                );
              })}
            </View>
            {hiddenCount > 0 && (
              <Button
                onPress={() => toggleExpanded(gramrelIndex)}
                variant="link"
                size="sm"
                className="mt-2"
              >
                {isExpanded ? (
                  <>
                    <ChevronUp size={14} color="#6366f1" />
                    <Text className={buttonTextClass('link')}>{t('action.show_less')}</Text>
                  </>
                ) : (
                  <>
                    <ChevronDown size={14} color="#6366f1" />
                    <Text className={buttonTextClass('link')}>
                      {t('action.show_more')}
                      <Text className="text-muted-foreground"> ({hiddenCount})</Text>
                    </Text>
                  </>
                )}
              </Button>
            )}
          </View>
        );
      })}
    </View>
  );
}
