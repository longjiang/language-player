import React, { useState, useEffect, useRef } from 'react';
import { View } from 'react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { useVideos } from '@langplayer/api-client';
import { useProgress } from '@/hooks/use-progress';
import { VideoGrid } from '@/components/video/VideoGrid';
import { LevelFilter } from '@/components/video/LevelFilter';
import type { YouTubeVideo } from '@langplayer/shared';

export default function ExploreScreen() {
  const { l2Lang } = useLanguage();
  const { user } = useAuth();
  const { level: savedLevel, loaded: progressLoaded } = useProgress(l2Lang.code);
  const { getRecommendations } = useVideos();

  const [videos, setVideos] = useState<YouTubeVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [level, setLevel] = useState<number | undefined>(undefined);
  const [hasMore, setHasMore] = useState(true);
  const seededRef = useRef(false);

  useEffect(() => {
    if (!seededRef.current && progressLoaded && savedLevel !== undefined) {
      seededRef.current = true;
      setLevel(savedLevel);
    }
  }, [progressLoaded, savedLevel]);

  const fetchVideos = async (append: boolean) => {
    try {
      const res = await getRecommendations({ l2: l2Lang.code, level, limit: 24, userId: user?.id });
      const newVideos = Array.isArray(res) ? res : (res as any)?.videos ?? (res as any)?.data ?? [];
      setVideos((prev) => (append ? [...prev, ...newVideos] : newVideos));
      setHasMore(newVideos.length >= 24);
    } catch (err) {
      console.warn('[explore] Fetch failed:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!progressLoaded) return;
    setLoading(true);
    fetchVideos(false);
  }, [l2Lang.code, level, progressLoaded]);

  const handleLoadMore = () => {
    if (loading || !hasMore) return;
    fetchVideos(false);
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchVideos(false);
  };

  return (
    <View className="flex-1 bg-background">
      <LevelFilter level={level} onSelect={setLevel} />
      <VideoGrid
        videos={videos}
        loading={loading}
        hasMore={hasMore}
        onLoadMore={handleLoadMore}
        onRefresh={handleRefresh}
        refreshing={refreshing}
      />
    </View>
  );
}
