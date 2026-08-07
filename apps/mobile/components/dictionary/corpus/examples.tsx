import React, { useMemo } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { isContinua, type SketchExamplesResponse } from '@langplayer/shared';
import { sentenceContaining } from '@langplayer/utils';
import { useT } from '@/hooks/use-t';
import { PYTHON_API_URL } from '@/lib/api-url';
import { ICON_MUTED } from '@/lib/theme-colors';
import { AlertCircle } from 'lucide-react-native';
import { useCorpusFetch } from './use-corpus-fetch';
import { useCorpusTranslations } from './use-corpus-translations';
import { TokenizedText } from '@/components/TokenizedText';
import { TextActionMenu } from '@/components/TextActionMenu';

interface CorpusExamplesProps {
  word: string;
  l2Code: string;
  l1Code?: string;
  /** Optional corpus override; null = let the backend auto-resolve. */
  corpname?: string | null;
  /** Word forms (head + variants + inflections) to highlight in each sentence. */
  highlightForms?: string[];
}

/**
 * Example sentences (concordance) with optional parallel translation.
 * GET /sketch-engine/examples?word=&l2=&l1=  (ARCH-020 §7.2)
 */
export function CorpusExamples({ word, l2Code, l1Code = 'en', corpname = null, highlightForms = [] }: CorpusExamplesProps) {
  const t = useT();
  const l2 = l2Code.split('-')[0];
  const corpnameParam = corpname ? `&corpname=${encodeURIComponent(corpname)}` : '';
  const url = `${PYTHON_API_URL}/sketch-engine/examples?word=${encodeURIComponent(word)}&l2=${l2}&l1=${l1Code.split('-')[0]}${corpnameParam}`;
  const { data, loading, error } = useCorpusFetch<SketchExamplesResponse>(url);

  const stripSpaces = isContinua(l2);

  // Trim each passage to the sentence containing the word (or an inflected form).
  const displayTexts = useMemo(() => {
    if (!data) return [];
    const searchForms = highlightForms.length > 0 ? highlightForms : [word];
    return data.examples.map((example) => {
      const sentence = stripSpaces ? example.l2.replace(/ /g, '') : example.l2;
      let hitOffset = -1;
      for (const f of searchForms) {
        if (!f) continue;
        const i = sentence.indexOf(f);
        if (i !== -1 && (hitOffset === -1 || i < hitOffset)) hitOffset = i;
      }
      return hitOffset !== -1 ? sentenceContaining(sentence, hitOffset, l2) : sentence;
    });
  }, [data, stripSpaces, l2, highlightForms, word]);

  const { translations } = useCorpusTranslations(displayTexts, l1Code.split('-')[0], l2);

  if (loading) {
    return (
      <View className="items-center justify-center py-10">
        <ActivityIndicator size="large" color={ICON_MUTED} />
      </View>
    );
  }

  if (error) {
    return (
      <View className="flex-row items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-4">
        <AlertCircle size={16} color="#ef4444" />
        <Text className="text-sm text-destructive">{t('error.failed_to_load', { status: error })}</Text>
      </View>
    );
  }

  if (!data || data.examples.length === 0) {
    return (
      <Text className="py-6 text-center text-sm text-muted-foreground">
        {t('msg.no_examples_found_corpus', { term: word })}
      </Text>
    );
  }

  return (
    <View>
      {data.examples.map((example, index) => {
        const display = displayTexts[index] ?? '';
        return (
          <View key={`${example.l2}-${index}`} className="border-b border-border py-3">
            <TextActionMenu className="w-full" text={display} l2Code={l2} l1Code={l1Code.split('-')[0]}>
              <TokenizedText text={display} l2Code={l2} leading="relaxed" highlightTerms={highlightForms} />
            </TextActionMenu>
            {translations[index] ? (
              <Text className="mt-1 text-xs leading-relaxed text-muted-foreground/70">
                {translations[index]}
              </Text>
            ) : null}
            {example.ref ? (
              <Text className="mt-1 text-xs text-muted-foreground/70">{example.ref}</Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}
