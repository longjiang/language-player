import React from 'react';
import { View, Text } from 'react-native';
import { useT } from '@/hooks/use-t';

/**
 * Corpus attribution footer — "Corpus data provided by Sketch Engine".
 * (The web also includes a corpus picker dropdown here; mobile keeps the
 * attribution line, matching the auto-resolved default corpus behaviour.)
 */
export function CorpusFooter() {
  const t = useT();
  return (
    <View className="mt-4 border-t border-border pt-2">
      <Text className="text-[10px] text-muted-foreground/60">{t('corpus.provided_by')}</Text>
    </View>
  );
}
