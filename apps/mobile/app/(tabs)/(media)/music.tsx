import React, { useState, useEffect } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { useT } from '@/hooks/use-t';
import { useVideos } from '@langplayer/api-client';
import { VideoGrid } from '@/components/video/VideoGrid';
import type { YouTubeVideo } from '@langplayer/shared';
import { PageContainer } from '@/components/layout/PageContainer';

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
    <PageContainer>
      <Text className="px-4 py-5 mb-4 text-xl font-bold text-foreground">{t('title.music_and_entertainment')}</Text>
      {loading ? (
        <View className="flex-1 items-center justify-center"><ActivityIndicator size="large" className="text-primary" /></View>
      ) : error ? (
        <View className="flex-1 items-center justify-center">
          <Text className="text-muted-foreground">{t(error as any)}</Text>
        </View>
      ) : (
        <VideoGrid videos={videos} loading={loading} />
      )}
    </PageContainer>
  );
}
