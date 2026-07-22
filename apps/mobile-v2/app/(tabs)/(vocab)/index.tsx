import React from 'react';
import { View, Text, FlatList } from 'react-native';
import { useT } from '@/hooks/use-t';
import { useDictionaryContext } from '@/contexts/DictionaryContext';
import { SearchBar } from '@/components/dictionary/SearchBar';
import { DictionaryEntryCard } from '@/components/dictionary/DictionaryEntryCard';
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
        <View className="mx-4 mt-4 rounded-lg border border-red-200 bg-red-50 p-3">
          <Text className="text-sm text-red-700">{error}</Text>
        </View>
      )}

      {message && !results?.length && (
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
