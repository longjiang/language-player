import React, { useState, useEffect, useRef } from 'react';
import { View, Text, FlatList, Pressable, Image, ActivityIndicator, TextInput } from 'react-native';
import { router } from 'expo-router';
import { useLanguage } from '@/contexts/LanguageContext';
import { useT } from '@/hooks/use-t';
import { PYTHON_API_URL } from '@/lib/api-url';
import type { YouTubeVideo } from '@langplayer/shared';

interface ShowWithMeta {
  id: string; title: string; locale: string;
  season?: number; episode?: number;
  year?: number; avg_views?: number;
  poster?: string; youtube_id?: string | null;
}

export default function TvShowsScreen() {
  const { l1Lang, l2Lang } = useLanguage();
  const t = useT();
  const [shows, setShows] = useState<ShowWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'views' | 'title' | 'year'>('views');

  useEffect(() => {
    setLoading(true);
    fetch(`${PYTHON_API_URL}/tv-shows?l2=${l2Lang.code}&limit=200`)
      .then((r) => r.json())
      .then((data) => { setShows(Array.isArray(data) ? data : []); setError(null); })
      .catch(() => setError('msg.no_videos_found'))
      .finally(() => setLoading(false));
  }, [l2Lang.code]);

  const filtered = shows
    .filter((s) => !search || s.title.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'views') return (b.avg_views ?? 0) - (a.avg_views ?? 0);
      if (sortBy === 'year') return (b.year ?? 0) - (a.year ?? 0);
      return (a.title ?? '').localeCompare(b.title ?? '');
    });

  if (loading) {
    return <View className="flex-1 items-center justify-center bg-background"><ActivityIndicator size="large" className="text-primary" /></View>;
  }

  if (error) {
    return <View className="flex-1 items-center justify-center bg-background"><Text className="text-muted-foreground">{t(error as any)}</Text></View>;
  }

  return (
    <View className="flex-1 bg-background">
      <Text className="px-4 py-3 text-xl font-bold text-foreground">{t('title.tv_shows')}</Text>
      <View className="flex-row items-center gap-2 border-b border-border px-4 py-2">
        <TextInput
          className="flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
          placeholder={t('action.search')}
          placeholderTextColor="#888"
          value={search}
          onChangeText={setSearch}
        />
        {['views', 'title', 'year'].map((s) => (
          <Pressable
            key={s}
            onPress={() => setSortBy(s as any)}
            className={`rounded-full px-2 py-1 ${sortBy === s ? 'bg-primary' : 'bg-muted'}`}
          >
            <Text className={`text-xs ${sortBy === s ? 'text-primary-foreground' : 'text-muted-foreground'}`}>{s}</Text>
          </Pressable>
        ))}
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => item.youtube_id ? router.push(`/(tabs)/(media)/watch/${item.youtube_id}` as any) : null}
            className="flex-row items-center gap-3 border-b border-border px-4 py-3"
          >
            <Image source={{ uri: item.poster ?? `https://img.youtube.com/vi/${item.youtube_id}/default.jpg` }} className="h-16 w-12 rounded" />
            <View className="flex-1">
              <Text className="text-sm font-medium text-foreground">{item.title}</Text>
              <Text className="text-xs text-muted-foreground">{item.year ?? ''}  {item.locale?.toUpperCase()}</Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
