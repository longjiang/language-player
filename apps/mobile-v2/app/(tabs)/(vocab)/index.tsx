import React from 'react';
import { View, Text, FlatList, ActivityIndicator } from 'react-native';
import { useT } from '@/hooks/use-t';
import { useDictionaryContext } from '@/contexts/DictionaryContext';
import { SearchBar } from '@/components/dictionary/SearchBar';
import { DictionaryEntryCard } from '@/components/dictionary/DictionaryEntryCard';
import { Search, BookOpen } from 'lucide-react-native';
import { ICON_MUTED } from '@/lib/theme-colors';
import type { DictionaryEntry } from '@langplayer/shared';

export default function DictionaryScreen() {
  const t = useT();
  const {
    query, setQuery, results, loading, error, message,
    doSearch, clearSearch,
    recentSearches, clearRecent,
    setCameFromSearch, setSidebarSource, setDetailHead,
  } = useDictionaryContext();

  const handleSearch = () => {
    if (query.trim()) doSearch(query.trim());
  };

  const handleEntryPress = (entry: DictionaryEntry) => {
    setDetailHead(entry.head);
    setSidebarSource({ kind: 'results', items: results! });
    setCameFromSearch(true);
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

      {/* Empty initial state */}
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

      {!query && recentSearches.length > 0 && !results?.length && (
        <View className="px-4 pt-4">
          <View className="flex-row items-center justify-between">
            <Text className="text-xs font-bold uppercase text-muted-foreground">
              {t('action.recent_searches')}
            </Text>
            <Text className="text-xs text-primary" onPress={clearRecent}>
              {t('action.clear')}
            </Text>
          </View>
          <View className="mt-2 flex-row flex-wrap gap-2">
            {recentSearches.map((term) => (
              <View key={term} className="rounded-full bg-muted px-3 py-1">
                <Text
                  className="text-sm text-foreground"
                  onPress={() => { setQuery(term); doSearch(term); }}
                >
                  {term}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {results && results.length > 0 && (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View className="px-4 py-1">
              <DictionaryEntryCard entry={item} onPress={handleEntryPress} />
            </View>
          )}
          className="mt-2"
        />
      )}
    </View>
  );
}
