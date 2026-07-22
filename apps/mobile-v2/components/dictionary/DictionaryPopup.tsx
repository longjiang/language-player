import React, { useState, useCallback } from 'react';
import { View, Text, Modal, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { useDictionary } from '@langplayer/api-client';
import { useLanguage } from '@/contexts/LanguageContext';
import { DictionaryEntryCard } from '@/components/dictionary/DictionaryEntryCard';
import type { DictionaryEntry } from '@langplayer/shared';
import { useT } from '@/hooks/use-t';

interface DictionaryPopupProps {
  visible: boolean;
  word: string;
  context?: string;
  translatedContext?: string;
  onClose: () => void;
  onViewDetail?: (entry: DictionaryEntry) => void;
}

export function DictionaryPopup({
  visible,
  word,
  context,
  translatedContext,
  onClose,
  onViewDetail,
}: DictionaryPopupProps) {
  const { l1Lang, l2Lang } = useLanguage();
  const dict = useDictionary();
  const t = useT();
  const [results, setResults] = useState<DictionaryEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Look up the word when the popup opens
  React.useEffect(() => {
    if (!visible || !word) return;
    setLoading(true);
    setError(null);
    setResults(null);

    dict.lookup(word, l2Lang.code, l1Lang.code)
      .then((res) => {
        setResults(res.results ?? []);
      })
      .catch((e) => {
        setError(e?.message ?? t('error.general'));
      })
      .finally(() => setLoading(false));
  }, [visible, word, l2Lang.code, l1Lang.code]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-background">
        {/* Header */}
        <View className="border-b border-border px-4 py-3">
          <View className="flex-row items-center justify-between">
            <Text className="text-lg font-bold text-foreground" numberOfLines={1}>
              {word}
            </Text>
            <Pressable onPress={onClose} className="rounded-full bg-muted p-1.5">
              <Text className="text-base text-muted-foreground">✕</Text>
            </Pressable>
          </View>

          {/* Context */}
          {context ? (
            <View className="mt-2 rounded-lg bg-muted/50 p-2">
              <Text className="text-sm text-foreground">{context}</Text>
              {translatedContext ? (
                <Text className="mt-1 text-sm text-muted-foreground">
                  {translatedContext}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>

        {/* Results */}
        <ScrollView className="flex-1 px-4 pt-3">
          {loading && (
            <View className="items-center py-12">
              <ActivityIndicator size="large" className="text-primary" />
              <Text className="mt-3 text-sm text-muted-foreground">
                {t('msg.loading')}
              </Text>
            </View>
          )}

          {error && (
            <View className="rounded-lg border border-red-200 bg-red-50 p-3">
              <Text className="text-sm text-red-700">{error}</Text>
            </View>
          )}

          {results && results.length === 0 && !loading && (
            <View className="items-center py-12">
              <Text className="text-muted-foreground">
                {t('msg.no_results')}
              </Text>
            </View>
          )}

          {results?.map((entry) => (
            <View key={entry.id} className="mb-2">
              <DictionaryEntryCard
                entry={entry}
                variant="compact"
                onPress={onViewDetail}
              />
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}
