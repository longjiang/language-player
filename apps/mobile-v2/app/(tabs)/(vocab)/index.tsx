import React from 'react';
import { View, Text, FlatList, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useT } from '@/hooks/use-t';
import { useDictionaryContext } from '@/contexts/DictionaryContext';
import { SearchBar } from '@/components/dictionary/SearchBar';
import { DictionaryEntryCard } from '@/components/dictionary/DictionaryEntryCard';
import { Search, BookOpen, Clock } from 'lucide-react-native';
import { ICON_MUTED } from '@/lib/theme-colors';
import type { DictionaryEntry } from '@langplayer/shared';

export default function DictionaryScreen() {
  const t = useT();
  const router = useRouter();
  const {
    query, setQuery, results, loading, error, message,
    doSearch, clearSearch,
    recentSearches, clearRecent,
    setCameFromSearch, setSidebarSource, setDetailHead,
  } = useDictionaryContext();

  const handleSearch = () => {
    if (query.trim()) doSearch(query.trim());
  };

  // Called when user taps a search result card.
  // Flow: set context state so WordDetailScreen can find the entry,
  // then navigate via expo-router to the word detail screen.
  // CEDICT entries have comma-containing IDs (e.g. "寬廣,kuān_guǎng,0").
  // Commas break expo-router, so we encode them as ~ (matching Next.js buildEntryRoute).
  // WordDetailScreen reverses this before calling the API.
  // DEBUG: Verbose logging to trace the tap → navigation → detail chain.
  // If handleEntryPress never fires, the bug is upstream (card Pressable).
  const handleEntryPress = (entry: DictionaryEntry) => {
    console.log('[Dict] handleEntryPress — entry:', JSON.stringify({ id: entry.id, head: entry.head }), '— timestamp:', Date.now());
    setDetailHead(entry.head);
    console.log('[Dict] handleEntryPress — setDetailHead done');
    setSidebarSource({ kind: 'results', items: results! });
    console.log('[Dict] handleEntryPress — setSidebarSource done');
    setCameFromSearch(true);
    console.log('[Dict] handleEntryPress — setCameFromSearch done, pushing route...');
    // Encode commas for expo-router compatibility
    const safeId = entry.id.replace(/,/g, '~');
    router.push(`word/${safeId}` as any);
    console.log('[Dict] handleEntryPress — router.push called, safeId:', safeId);
  };

  return (
    <View className="flex-1 bg-background">
      <View className="px-4 py-5">
        <Text className="text-xl font-bold text-foreground">{t('title.dictionary')}</Text>
      </View>

      <View className="px-4 pt-2">
        <SearchBar
          value={query}
          onChangeText={setQuery}
          onSubmit={handleSearch}
          onClear={clearSearch}
          loading={loading}
        />
      </View>

      {error && (
        <View className="mx-4 mt-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
          <Text className="text-sm text-destructive">{error}</Text>
        </View>
      )}

      {loading && (
        <ActivityIndicator size="large" color={ICON_MUTED} style={{ marginTop: 40 }} />
      )}

      {/* Empty state: recent searches (matches Next.js) */}
      {!query && !loading && !results?.length && recentSearches.length > 0 && (
        <View className="px-4 pt-4">
          <View className="rounded-xl border border-border bg-card p-5">
            <View className="mb-3 flex-row items-center justify-between">
              <View className="flex-row items-center gap-2">
                <Clock size={16} color={ICON_MUTED} />
                <Text className="text-sm font-medium text-muted-foreground">
                  {t('title.recent_searches')}
                </Text>
              </View>
              <Text className="text-xs text-primary" onPress={clearRecent}>
                {t('action.clear_recent_searches')}
              </Text>
            </View>
            {recentSearches.map((term) => (
              <Pressable
                key={term}
                onPress={() => { setQuery(term); doSearch(term); }}
                className="flex-row items-center gap-3 rounded-lg px-3 py-2 active:bg-muted/60"
              >
                <Clock size={14} color={ICON_MUTED} />
                <Text className="flex-1 text-sm text-foreground" numberOfLines={1}>
                  {term}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {/* Empty initial state (no recents) */}
      {!query && !loading && !results?.length && recentSearches.length === 0 && (
        <View className="mt-12 items-center px-8">
          <Search size={48} color={ICON_MUTED} style={{ marginBottom: 16 }} />
          <Text className="text-center text-muted-foreground">{t('title.dictionary')}</Text>
        </View>
      )}

      {message && !results?.length && !loading && (
        <View className="mx-4 mt-8 items-center">
          <Text className="text-muted-foreground">{message}</Text>
        </View>
      )}

      {/* Recent searches strip — shown above results when available */}
      {recentSearches.length > 0 && (
        <View className={`px-4 ${results?.length ? 'pt-1' : 'pt-4'}`}>
          <View className="flex-row items-center gap-2">
            <Clock size={12} color={ICON_MUTED} />
            <Text className="text-xs text-muted-foreground">{t('title.recent_searches')}</Text>
          </View>
          <View className="mt-1.5 flex-row flex-wrap gap-2">
            {recentSearches.map((term) => (
              <Pressable
                key={term}
                onPress={() => { setQuery(term); doSearch(term); }}
                className="rounded-full bg-muted/50 px-3 py-1"
              >
                <Text className="text-xs text-muted-foreground" numberOfLines={1}>{term}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {results && results.length > 0 && (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View className="px-4 py-1"
              onTouchEnd={() => console.log('[Dict] FlatList item touch — id:', item.id, 'head:', item.head)}>
              <DictionaryEntryCard entry={item} onPress={handleEntryPress} />
            </View>
          )}
          className="mt-2"
        />
      )}
    </View>
  );
}
