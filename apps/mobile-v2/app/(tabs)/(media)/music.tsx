import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, Pressable, ActivityIndicator } from 'react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { useT } from '@/hooks/use-t';
import { useVideos } from '@langplayer/api-client';
import { VideoCard } from '@/components/video/VideoCard';
import type { YouTubeVideo } from '@langplayer/shared';

export default function MusicScreen() {
  const { l2Lang } = useLanguage();
  const t = useT();
  const { getRecommendations } = useVideos();
  const [videos, setVideos] = useState<YouTubeVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getRecommendations({ l2: l2Lang.code, limit: 24 })
      .then((res) => { setVideos(Array.isArray(res) ? res : (res as any)?.videos ?? []); setError(null); })
      .catch(() => setError('msg.no_videos_found'))
      .finally(() => setLoading(false));
  }, [l2Lang.code]);

  return (
    <View className="flex-1 bg-background px-4">
      <Text className="py-3 text-xl font-bold text-foreground">{t('title.music_and_entertainment')}</Text>
      {loading ? (
        <View className="flex-1 items-center justify-center"><ActivityIndicator size="large" className="text-primary" /></View>
      ) : error ? (
        <View className="flex-1 items-center justify-center">
          <Text className="text-muted-foreground">{t(error as any)}</Text>
        </View>
      ) : (
        <FlatList
          data={videos}
          keyExtractor={(item) => item.youtube_id}
          renderItem={({ item }) => <VideoCard video={item} />}
        />
      )}
    </View>
  );
}
