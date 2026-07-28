import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { useDictionary } from '@langplayer/api-client';
import { useLanguage } from '@/contexts/LanguageContext';
import { DictionaryEntryCard } from '@/components/dictionary/DictionaryEntryCard';
import { SaveButton } from '@/components/dictionary/SaveButton';
import * as Dialog from '@/components/ui/dialog';
import type { DictionaryEntry } from '@langplayer/shared';
import { useT } from '@/hooks/use-t';

interface DictionaryPopupProps {
  visible: boolean;
  word: string;
  /** Lemma (dictionary form) to prioritize in lookup. Falls back to `word` if not set. */
  lemma?: string;
  context?: string;
  translatedContext?: string;
  onClose: () => void;
  onViewDetail?: (entry: DictionaryEntry, allResults: DictionaryEntry[]) => void;
}

export function DictionaryPopup({
  visible,
  word,
  lemma,
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
  const [lookedUpLemma, setLookedUpLemma] = useState(false);

  // Look up the word when the popup opens
  React.useEffect(() => {
    if (!visible || !word) return;
    setLoading(true);
    setError(null);
    setResults(null);

    const l2 = l2Lang.code;
    const l1 = l1Lang.code;
    const lookupWord = lemma && lemma !== word ? lemma : word;
    const alsoLookupSurface = lookupWord !== word;

    (async () => {
      try {
        // Primary: lookup by lemma
        const primaryRes = await dict.lookup(lookupWord, l2, l1);
        const primaryResults = primaryRes.results ?? [];

        if (!alsoLookupSurface) {
          setResults(primaryResults);
          return;
        }

        // Secondary: also lookup surface form, merge deduplicated
        setLookedUpLemma(true);
        const surfaceRes = await dict.lookup(word, l2, l1);
        const surfaceResults = (surfaceRes.results ?? []).filter(
          (entry: DictionaryEntry) => !primaryResults.some((p: DictionaryEntry) => p.id === entry.id),
        );
        setResults([...primaryResults, ...surfaceResults]);
      } catch (e: any) {
        setError(e?.message ?? t('error.general'));
      } finally {
        setLoading(false);
      }
    })();
  }, [visible, word, lemma, l2Lang.code, l1Lang.code]);

  const lemmaForm = lemma && lemma !== word ? lemma : null;

  return (
    <Dialog.Root open={visible} onOpenChange={(v) => { if (!v) onClose(); }}>
      <Dialog.Portal>
        <Dialog.SheetContent testID="dictionary-popup">
          {/* Header — surface form as headline, lemma below when different (matches web) */}
          <View className="mb-3 flex-row items-center justify-between">
            <View className="flex-1 mr-2">
              <Text className="text-lg font-bold text-foreground" numberOfLines={1} testID="dictionary-popup-word">
                {word}
              </Text>
              {lemmaForm && (
                <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                  lemma: {lemmaForm}
                </Text>
              )}
            </View>
            <Dialog.Close className="rounded-full bg-muted p-1.5">
              <Text className="text-base text-muted-foreground">✕</Text>
            </Dialog.Close>
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

          {/* Results */}
          <ScrollView className="pt-3">
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
              <View key={entry.id} className="mb-2 flex-row items-start gap-2">
                <View className="flex-1">
                  <DictionaryEntryCard
                    entry={entry}
                    variant="compact"
                    onPress={onViewDetail ? (e) => onViewDetail(e, results ?? []) : undefined}
                    l2Code={l2Lang.code}
                  />
                </View>
                <SaveButton entry={entry} size={18} />
              </View>
            ))}
          </ScrollView>
        </Dialog.SheetContent>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
