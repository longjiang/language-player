import React from 'react';
import { View, Text } from 'react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSavedWords } from '@/hooks/use-saved-words';
import { WordList } from '@/components/dictionary/WordList';
import { useT } from '@/hooks/use-t';

export default function SavedWordsScreen() {
  const { l2Lang } = useLanguage();
  const t = useT();
  const { savedWords, removeWord } = useSavedWords();
  const words = (savedWords[l2Lang.code] ?? []).map((w) => ({
    id: w.id,
    head: w.head,
    pronunciation: '',
    definition: '',
  }));

  const handleRemove = (word: { id: string; head: string }) => {
    removeWord(l2Lang.code, word.id);
  };

  return (
    <View className="flex-1 bg-background">
      <View className="border-b border-border px-4 py-3">
        <Text className="text-xl font-bold text-foreground">{t('title.saved_words')}</Text>
        <Text className="mt-0.5 text-sm text-muted-foreground">
          {words.length} {t('label.words')}
        </Text>
      </View>
      <WordList words={words} onRemove={handleRemove} />
    </View>
  );
}
