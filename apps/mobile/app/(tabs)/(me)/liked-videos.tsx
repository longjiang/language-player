import React, { useCallback } from 'react';
import { View, Text, Image, FlatList, ActivityIndicator } from 'react-native';
import { Pressable } from '@/components/ui/pressable';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import { useUserLibraryContext } from '@/contexts/UserLibraryContext';
import { useVideoPlayer } from '@/contexts/VideoPlayerContext';
import { useT } from '@/hooks/use-t';
import { Heart, Clock, Play } from 'lucide-react-native';
import { ICON_MUTED, ICON_DESTRUCTIVE } from '@/lib/theme-colors';
import type { LikedVideo, YouTubeVideo } from '@langplayer/shared';
import { PageContainer } from '@/components/layout/PageContainer';

function youtubeThumbnail(id: string): string {
  return `https://img.youtube.com/vi/${id}/mqdefault.jpg`;
}

function formatDate(date?: string | null, locale: string = 'en'): string {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function LikedVideosScreen() {
  const { l1Lang, l2Lang } = useLanguage();
  const { loaded, isSignedIn, getLikedVideos, unlikeVideo } = useUserLibraryContext();
  const { playVideo } = useVideoPlayer();
  const t = useT();

  const l2Code = l2Lang?.code ?? '';
  const liked = getLikedVideos(l2Code);

  const handlePlay = useCallback((item: LikedVideo, index: number) => {
    const queue: YouTubeVideo[] = liked.map((like) => ({
      youtube_id: like.youtube_id,
      id: String(like.id),
      title: like.title,
    }));
    playVideo(queue[index]!, queue, 'recommended');
  }, [liked, playVideo]);

  const handleUnlike = useCallback((item: LikedVideo) => {
    // Match web: unlike immediately, no confirmation dialog.
    void unlikeVideo(item);
  }, [unlikeVideo]);

  // ── Not authenticated ──
  if (!isSignedIn) {
    return (
      <PageContainer maxWidth="4xl">
        <Text className="px-4 py-5 mb-4 text-xl font-bold text-foreground">{t('title.liked_videos')}</Text>
        <View className="flex-1 items-center justify-center px-8">
          <Heart size={40} className="mb-3 text-muted-foreground" />
          <Text className="text-center text-muted-foreground">{t('msg.not_authenticated')}</Text>
        </View>
      </PageContainer>
    );
  }

  // ── Loading ──
  if (!loaded) {
    return (
      <PageContainer maxWidth="4xl">
        <Text className="px-4 py-5 mb-4 text-xl font-bold text-foreground">{t('title.liked_videos')}</Text>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" className="text-primary" />
        </View>
      </PageContainer>
    );
  }

  // ── Empty ──
  if (liked.length === 0) {
    return (
      <PageContainer maxWidth="4xl">
        <Text className="px-4 py-5 mb-4 text-xl font-bold text-foreground">{t('title.liked_videos')}</Text>
        <View className="flex-1 items-center justify-center px-8">
          <Heart size={40} className="mb-3 text-muted-foreground" />
          <Text className="text-center text-muted-foreground">{t('msg.no_liked_videos')}</Text>
        </View>
      </PageContainer>
    );
  }

  // ── List ──
  return (
    <PageContainer maxWidth="4xl">
      <Text className="px-4 py-5 mb-4 text-xl font-bold text-foreground">{t('title.liked_videos')}</Text>
      <FlatList
        data={liked}
        keyExtractor={(item, idx) => `${item.id}-${item.youtube_id}-${idx}`}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20 }}
        renderItem={({ item, index }) => {
          const dateStr = formatDate(item.created_on ?? item.createdOn, l1Lang?.code ?? 'en');
          return (
            <Pressable
              onPress={() => handlePlay(item, index)}
              className="mb-1 flex-row items-center gap-3 rounded-lg border border-border px-3 py-2 active:bg-muted"
            >
              {/* Thumbnail */}
              <View className="relative h-14 w-24 overflow-hidden rounded bg-muted">
                <Image source={{ uri: youtubeThumbnail(item.youtube_id) }} className="h-full w-full" />
                <View className="absolute inset-0 items-center justify-center">
                  <Play size={18} color="#fff" fill="#fff" />
                </View>
              </View>

              {/* Info */}
              <View className="flex-1 min-w-0">
                <Text className="text-sm font-medium text-foreground" numberOfLines={2}>
                  {item.title ?? t('label.untitled_video')}
                </Text>
                {dateStr ? (
                  <View className="mt-1 flex-row items-center gap-1">
                    <Clock size={12} className="text-muted-foreground" />
                    <Text className="text-xs text-muted-foreground">{dateStr}</Text>
                  </View>
                ) : null}
              </View>

              {/* Unlike */}
              <Button
                onPress={() => handleUnlike(item)}
                variant="ghost"
                size="icon"
                hitSlop={8}
              >
                <Heart size={18} color={ICON_DESTRUCTIVE} fill={ICON_DESTRUCTIVE} />
              </Button>
            </Pressable>
          );
        }}
      />
    </PageContainer>
  );
}
