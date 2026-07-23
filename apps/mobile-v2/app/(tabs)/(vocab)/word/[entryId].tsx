import React from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useT } from '@/hooks/use-t';
import { useDictionaryContext } from '@/contexts/DictionaryContext';
import { DictionaryEntryCard } from '@/components/dictionary/DictionaryEntryCard';
import { ICON_MUTED } from '@/lib/theme-colors';

export default function WordDetailScreen() {
  const { entryId } = useLocalSearchParams<{ entryId: string }>();
  const t = useT();
  const { results, loading, error, sidebarSource, cameFromSearch } = useDictionaryContext();

  // DEBUG: This screen receives the entry ID via expo-router params and looks up
  // the full entry from context (sidebarSource set by handleEntryPress, or fallback
  // to results). Logging confirms: navigation reached this screen, entryId populated,
  // and whether the entry was found in context.

  console.log('[Dict] WordDetailScreen render — entryId:', entryId, '— timestamp:', Date.now(), '— cameFromSearch:', cameFromSearch, '— sidebarSource.kind:', sidebarSource.kind, '— results count:', results?.length ?? 0);

  React.useEffect(() => {
    console.log('[Dict] WordDetailScreen mounted with entryId:', entryId);
  }, [entryId]);

  // Find the entry from sidebar source or search results
  const entry = React.useMemo(() => {
    console.log('[Dict] WordDetailScreen useMemo — entryId:', entryId, 'sidebarSource.kind:', sidebarSource.kind);
    if (sidebarSource.kind === 'results') {
      const found = sidebarSource.items.find((e) => e.id === entryId);
      console.log('[Dict] WordDetailScreen — searching sidebarSource.results, found:', !!found, found ? `head: ${found.head}` : '');
      return found;
    }
    if (results) {
      const found = results.find((e) => e.id === entryId);
      console.log('[Dict] WordDetailScreen — searching results, found:', !!found, found ? `head: ${found.head}` : '');
      return found;
    }
    console.log('[Dict] WordDetailScreen — no source available to find entry');
    return null;
  }, [entryId, results, sidebarSource]);

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color={ICON_MUTED} />
      </View>
    );
  }

  if (error) {
    return (
      <View className="flex-1 items-center justify-center bg-background p-4">
        <Text className="px-4 py-5 mb-4 text-xl font-bold text-foreground">{t('title.dictionary')}</Text>
        <View className="mx-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
          <Text className="text-sm text-destructive">{error}</Text>
        </View>
      </View>
    );
  }

  if (!entry) {
    return (
      <View className="flex-1 items-center justify-center bg-background p-4">
        <Text className="px-4 py-5 mb-4 text-xl font-bold text-foreground">{t('title.dictionary')}</Text>
        <Text className="text-muted-foreground">{t('msg.no_notes_yet')}</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <View className="px-4 py-5 mb-4">
        <Text className="text-xl font-bold text-foreground">{entry.head}</Text>
        {entry.pronunciation && (
          <Text className="mt-1 text-sm text-muted-foreground">{entry.pronunciation}</Text>
        )}
      </View>
      <ScrollView className="flex-1 px-4">
        {entry.definitions && entry.definitions.length > 0 && (
          <View className="mb-4">
            <Text className="mb-2 text-sm font-semibold text-muted-foreground">{'Definitions'}</Text>
            {entry.definitions.map((def, i) => (
              <View key={i} className="mb-2 rounded-lg bg-muted/50 p-3">
                <Text className="text-sm text-foreground">{def.definition}</Text>
                {def.pos && <Text className="mt-1 text-xs text-muted-foreground">{def.pos}</Text>}
                {def.examples && def.examples.length > 0 && (
                  <View className="mt-2">
                    {def.examples.slice(0, 3).map((ex, j) => (
                      <View key={j} className="mt-1 border-l-2 border-muted-foreground/20 pl-2">
                        <Text className="text-xs text-foreground">{ex.text}</Text>
                        {ex.translation && (
                          <Text className="text-xs text-muted-foreground">{ex.translation}</Text>
                        )}
                      </View>
                    ))}
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        {entry.inflections && entry.inflections.length > 0 && (
          <View className="mb-4">
            <Text className="mb-2 text-sm font-semibold text-muted-foreground">{'Inflections'}</Text>
            <View className="flex-row flex-wrap gap-1.5">
              {entry.inflections.map((infl, i) => (
                <View key={i} className="rounded-full border border-border bg-muted/30 px-3 py-1">
                  <Text className="text-xs text-foreground">{infl.text}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {entry.ai_explain && (
          <View className="mb-4 rounded-lg border border-primary/20 bg-primary/5 p-3">
            <Text className="mb-1 text-xs font-semibold text-primary">{'AI Explanation'}</Text>
            <Text className="text-sm text-foreground">{entry.ai_explain}</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
