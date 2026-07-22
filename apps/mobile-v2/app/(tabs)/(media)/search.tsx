import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, Pressable, ActivityIndicator, TextInput } from 'react-native';
import { router } from 'expo-router';
import { useLanguage } from '@/contexts/LanguageContext';
import { useT } from '@/hooks/use-t';
import { useVideos, apiClient } from '@langplayer/api-client';
import { VideoCard } from '@/components/video/VideoCard';
import type { YouTubeVideo } from '@langplayer/shared';

export default function SearchScreen() {
  const { l1Lang, l2Lang } = useLanguage();
  const t = useT();
  const videosApi = useVideos();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<YouTubeVideo[] | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setLoading(true);
    try {
      const res = await videosApi.searchByTitle({ q: trimmed, l2: l2Lang.code, limit: 30 });
      setResults(Array.isArray(res) ? res : []);
    } catch { setResults([]); }
    finally { setLoading(false); }
  };

  return (
    <View className="flex-1 bg-background">
      <View className="flex-row items-center gap-2 border-b border-border px-4 py-2">
        <TextInput
          className="flex-1 rounded-lg border border-border bg-card px-3 py-2 text-base text-foreground"
          placeholder={t('placeholder.search_dots')}
          placeholderTextColor="#888"
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={handleSearch}
          returnKeyType="search"
          autoCapitalize="none"
        />
        <Pressable onPress={handleSearch} className="rounded-lg bg-primary px-4 py-2">
          <Text className="text-sm font-bold text-primary-foreground">{t('action.search')}</Text>
        </Pressable>
      </View>

      {loading && <ActivityIndicator size="large" className="text-primary mt-8" />}
      {results && results.length === 0 && (
        <Text className="mt-8 text-center text-muted-foreground">{t('msg.no_results')}</Text>
      )}
      {results && results.length > 0 && (
        <FlatList
          data={results}
          keyExtractor={(item) => item.youtube_id}
          renderItem={({ item }) => (
            <View className="px-4 pt-2">
              <VideoCard video={item} layout="list" />
            </View>
          )}
        />
      )}
    </View>
  );
}
