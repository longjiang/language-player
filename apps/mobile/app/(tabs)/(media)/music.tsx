import React, { useState, useEffect, useRef } from 'react';
import { View, Text } from 'react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { useT } from '@/hooks/use-t';
import { useVideos } from '@langplayer/api-client';
import { useProgress } from '@/hooks/use-progress';
import { VideoGrid } from '@/components/video/VideoGrid';
import { LevelFilter } from '@/components/video/LevelFilter';
import { PageContainer } from '@/components/layout/PageContainer';
import { OfflineFeatureNotice } from '@/components/OfflineFeatureNotice';
import type { YouTubeVideo } from '@langplayer/shared';
import { baseCode } from '@langplayer/utils';
import { logwarn } from '@/lib/logger';

export default function MusicScreen() {
  const { l2Lang } = useLanguage();
  const { user } = useAuth();
  const t = useT();
  const { level: savedLevel, loaded: progressLoaded } = useProgress(l2Lang.code);
  const { getMusicEntertainment } = useVideos();

  const [videos, setVideos] = useState<YouTubeVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [level, setLevel] = useState<number | undefined>(undefined);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);
  const seededRef = useRef(false);
  const requestSeqRef = useRef(0);

  useEffect(() => {
    if (!seededRef.current && progressLoaded && savedLevel !== undefined) {
      seededRef.current = true;
      setLevel(savedLevel);
    }
  }, [progressLoaded, savedLevel]);

  const fetchVideos = async (append: boolean, pageNum: number) => {
    const seq = ++requestSeqRef.current;
    setLoading(true);
    try {
      const res = await getMusicEntertainment({
        l2: baseCode(l2Lang.code),
        level,
        limit: 24,
        page: pageNum,
        userId: user?.id,
      });
      if (seq !== requestSeqRef.current) return;
      const newVideos = Array.isArray(res) ? res : (res as any)?.videos ?? (res as any)?.data ?? [];
      setVideos((prev) => {
        const combined = append ? [...prev, ...newVideos] : newVideos;
        // Deduplicate — paginated responses can overlap between pages.
        const seen = new Set<string>();
        return combined.filter((v: YouTubeVideo) => {
          if (!v.youtube_id || seen.has(v.youtube_id)) return false;
          seen.add(v.youtube_id);
          return true;
        });
      });
      setHasMore(newVideos.length >= 24);
      setError(null);
    } catch (err) {
      if (seq !== requestSeqRef.current) return;
      logwarn('[music] Fetch failed:', err);
      if (videos.length === 0) setError('msg.no_videos_found');
    } finally {
      if (seq === requestSeqRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  };

  useEffect(() => {
    if (!progressLoaded) return;
    setPage(1);
    fetchVideos(false, 1);
  }, [l2Lang.code, level, progressLoaded]);

  const handleLoadMore = () => {
    if (loading || !hasMore) return;
    const nextPage = page + 1;
    setPage(nextPage);
    fetchVideos(true, nextPage);
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchVideos(false, 1);
  };

  return (
    <PageContainer maxWidth="7xl">
      <View className="px-4 pt-4 pb-1">
        <Text className="text-2xl font-bold text-foreground">
          {t('title.music_and_entertainment')}
        </Text>
        <Text className="mt-1 text-sm text-muted-foreground">
          {t('msg.music_and_entertainment_desc', { l2: l2Lang.name })}
        </Text>
      </View>
      <OfflineFeatureNotice />
      <LevelFilter level={level} onSelect={setLevel} l2Code={l2Lang.code} />
      {error && videos.length === 0 && (
        <View className="mx-4 mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3">
          <Text className="text-sm text-destructive">{t(error as any)}</Text>
        </View>
      )}
      <VideoGrid
        videos={videos}
        loading={loading}
        hasMore={hasMore}
        onLoadMore={handleLoadMore}
        onRefresh={handleRefresh}
        refreshing={refreshing}
        queueType="recommended"
      />
    </PageContainer>
  );
}
