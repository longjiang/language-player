import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  Pressable,
  ActivityIndicator,
  Linking,
  ScrollView,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useLanguage } from '@/contexts/LanguageContext';
import { useT } from '@/hooks/use-t';
import { useVideos, apiClient } from '@langplayer/api-client';
import { VideoGrid } from '@/components/video/VideoGrid';
import { YouTubePlayer } from '@/components/video/YouTubePlayer';
import { AlertCircle } from 'lucide-react-native';
import { ICON_MUTED, ICON_PRIMARY, ICON_DESTRUCTIVE } from '@/lib/theme-colors';
import { baseCode } from '@langplayer/utils';
import type { YouTubeVideo } from '@langplayer/shared';

interface ChannelInfo {
  title: string;
  thumbnail: string;
}

interface ChannelResponse {
  channel: ChannelInfo | null;
  videos: YouTubeVideo[];
  hasMore: boolean;
}

export default function ChannelPage() {
  const { channelId: rawChannelId } = useLocalSearchParams<{ channelId: string }>();
  const { l2Lang } = useLanguage();
  const t = useT();
  const channelId = rawChannelId ? decodeURIComponent(rawChannelId) : '';

  const [channel, setChannel] = useState<ChannelInfo | null>(null);
  const [videos, setVideos] = useState<YouTubeVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);

  const fetchVideos = useCallback(
    async (pageNum: number, append = false) => {
      setLoading(true);
      setError(null);

      try {
        const res = await apiClient.get<ChannelResponse>(
          `/channels/${encodeURIComponent(channelId)}`,
          {
            params: {
              l2: baseCode(l2Lang.code),
              page: String(pageNum),
              page_size: '24',
            },
          },
        );

        if (!append && res.channel) setChannel(res.channel);
        setVideos((prev) => (append ? [...prev, ...res.videos] : res.videos));
        setHasMore(res.hasMore);
      } catch (err: any) {
        setError(err?.message ?? t('error.failed_to_load', { status: err?.code ?? '' }));
      } finally {
        setLoading(false);
      }
    },
    [channelId, l2Lang.code, t],
  );

  useEffect(() => {
    if (!channelId) return;
    setPage(1);
    setVideos([]);
    fetchVideos(1, false);
  }, [fetchVideos, channelId]);

  const loadMore = () => {
    if (loading || !hasMore) return;
    const nextPage = page + 1;
    setPage(nextPage);
    fetchVideos(nextPage, true);
  };

  if (!channelId) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Text className="text-muted-foreground">{t('msg.no_videos_found')}</Text>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-background" contentContainerStyle={{ paddingBottom: 32 }}>
      <View className="px-4 py-5">
        {/* Channel header */}
        {channel && (
          <View className="mb-6 flex-row items-center gap-4 rounded-xl border border-border bg-card p-4">
            <Image
              source={{
                uri: channel.thumbnail || 'https://www.youtube.com/favicon.ico',
              }}
              className="h-16 w-16 rounded-full"
            />
            <View className="flex-1">
              <Text className="text-xl font-bold text-foreground">{channel.title}</Text>
              <Pressable
                onPress={() =>
                  Linking.openURL(`https://www.youtube.com/channel/${channelId}`)
                }
              >
                <Text className="text-sm text-muted-foreground">{t('action.view_on_youtube')} ↗</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Loading — initial (no channel data yet) */}
        {loading && !channel && (
          <View className="items-center justify-center py-20">
            <ActivityIndicator size="large" color={ICON_MUTED} />
          </View>
        )}

        {/* Loading — first page (channel loaded, videos loading) */}
        {loading && videos.length === 0 && channel && (
          <View className="flex-row flex-wrap gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <View
                key={i}
                className="w-[48%] overflow-hidden rounded-xl border border-border"
              >
                <View className="aspect-video animate-pulse bg-muted" />
                <View className="space-y-2 p-3">
                  <View className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                  <View className="h-3 w-1/2 animate-pulse rounded bg-muted" />
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Error */}
        {error && videos.length === 0 && (
          <View className="items-center gap-4 rounded-2xl border-2 border-dashed border-destructive/30 p-8">
            <AlertCircle size={40} color={ICON_DESTRUCTIVE} />
            <Text className="text-center text-muted-foreground">{error}</Text>
            <Pressable
              onPress={() => fetchVideos(1)}
              className="rounded-lg border border-border px-4 py-2 active:bg-muted"
            >
              <Text className="text-sm font-medium text-foreground">{t('action.try_again')}</Text>
            </Pressable>
          </View>
        )}

        {/* Empty */}
        {!loading && !error && videos.length === 0 && (
          <View className="items-center rounded-2xl border-2 border-dashed border-border p-8">
            <Text className="text-center text-muted-foreground">
              {t('msg.no_videos_found')}
            </Text>
          </View>
        )}
      </View>

      {/* Video grid */}
      {videos.length > 0 && (
        <>
          <VideoGrid videos={videos} />

          {hasMore && (
            <View className="mt-6 items-center px-4">
              <Pressable
                onPress={loadMore}
                disabled={loading}
                className="rounded-lg border border-border px-6 py-3 active:bg-muted"
              >
                <View className="flex-row items-center gap-2">
                  {loading && <ActivityIndicator size="small" color={ICON_MUTED} />}
                  <Text className="text-sm font-medium text-foreground">
                    {t('action.load_more')}
                  </Text>
                </View>
              </Pressable>
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}
