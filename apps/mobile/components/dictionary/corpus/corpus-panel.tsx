import React, { useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { Pressable } from '@/components/ui/pressable';
import { useT } from '@/hooks/use-t';
import { Collocations } from './collocations';
import { CorpusExamples } from './examples';
import { RelatedWords } from './related';
import { Mistakes } from './mistakes';
import { CorpusFooter } from './corpus-footer';

type CorpusPill = 'collocations' | 'examples' | 'related' | 'mistakes';

interface CorpusPanelProps {
  /** The word to look up in the corpus (the dictionary head form). */
  word: string;
  /** ISO 639-1 code of the target language. */
  l2Code: string;
  /** ISO 639-1 code of the user's L1 (used for parallel translations). */
  l1Code?: string;
  /** Word forms (head + script variants + inflections) to highlight. */
  highlightForms?: string[];
}

/**
 * "Corpus" tab content: Sketch Engine corpus features (ARCH-020) behind four
 * pills — Collocations, Examples, Related, Mistakes. Mistakes only applies to
 * Chinese (l2 = zh) and is hidden for other languages.
 */
export function CorpusPanel({ word, l2Code, l1Code = 'en', highlightForms = [] }: CorpusPanelProps) {
  const t = useT();
  const showMistakes = l2Code.split('-')[0] === 'zh';
  const [active, setActive] = useState<CorpusPill>('collocations');

  const pills: { key: CorpusPill; label: string }[] = [
    { key: 'collocations', label: t('title.collocations') },
    { key: 'examples', label: t('title.examples') },
    { key: 'related', label: t('title.related') },
    ...(showMistakes ? [{ key: 'mistakes' as const, label: t('title.mistakes') }] : []),
  ];

  return (
    <View>
      {/* Pills row (horizontal scroll) */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
        <View className="flex-row items-center gap-1.5 py-1">
          {pills.map((pill) => {
            const isActive = active === pill.key;
            return (
              <Pressable
                key={pill.key}
                onPress={() => setActive(pill.key)}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
                className={`rounded-full border px-3 py-1.5 ${isActive ? 'border-primary bg-primary' : 'border-border bg-muted'}`}
              >
                <Text className={`text-xs ${isActive ? 'text-primary-foreground' : 'text-muted-foreground'}`}>
                  {pill.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      {/* Only the active section renders (mobile mounts on demand). */}
      {active === 'collocations' && (
        <Collocations word={word} l2Code={l2Code} l1Code={l1Code} highlightForms={highlightForms} />
      )}
      {active === 'examples' && (
        <CorpusExamples word={word} l2Code={l2Code} l1Code={l1Code} highlightForms={highlightForms} />
      )}
      {active === 'related' && (
        <RelatedWords word={word} l2Code={l2Code} l1Code={l1Code} />
      )}
      {showMistakes && active === 'mistakes' && (
        <Mistakes word={word} highlightTerms={highlightForms} />
      )}

      {/* Shared footer: attribution + corpus name */}
      <CorpusFooter />
    </View>
  );
}
