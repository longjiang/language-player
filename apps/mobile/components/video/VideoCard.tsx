import React from 'react';
import { View, Text, Pressable, Image } from 'react-native';
import { router } from 'expo-router';
import type { YouTubeVideo } from '@langplayer/shared';
import { getLevelFromDifficulty, formatNumericLevel, primaryScale, LEVEL_HEX_COLORS } from '@langplayer/shared';
import { useT } from '@/hooks/use-t';
import { useLanguage } from '@/contexts/LanguageContext';
import { useVideoPlayer } from '@/contexts/VideoPlayerContext';
import { useDifficultyProfile } from '@/hooks/use-difficulty-profile';
import { e2e } from '@/lib/e2e';
import { ChannelActionsMenu } from './ChannelActionsMenu';
import type { QueueType } from '@langplayer/utils';

interface VideoCardProps {
  video: YouTubeVideo;
  layout?: 'card' | 'list';
  /** When provided, tapping the card starts the video in this queue. */
  videos?: YouTubeVideo[];
  queueType?: QueueType;
  isActive?: boolean;
  /** Optional testID override. When set, this replaces the auto-generated video-card-{youtube_id}. */
  testID?: string;
}

function formatDuration(seconds: number | string | undefined): string {
  if (seconds == null || seconds === '') return '';
  let num: number;
  if (typeof seconds === 'string') {
    // Support ISO 8601 durations (PT1H23M45S) as well as plain seconds.
    const m = seconds.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/);
    if (m) {
      num = parseInt(m[1] ?? '0', 10) * 3600 + parseInt(m[2] ?? '0', 10) * 60 + parseFloat(m[3] ?? '0');
    } else {
      num = parseFloat(seconds);
    }
  } else {
    num = seconds;
  }
  if (isNaN(num) || num <= 0) return '';
  const mins = Math.floor(num / 60);
  const secs = Math.floor(num % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatViews(views: number | undefined): string {
  if (!views) return '';
  if (views >= 1_000_000) return `${(views / 1_000_000).toFixed(1)}M`;
  if (views >= 1_000) return `${(views / 1_000).toFixed(1)}K`;
  return String(views);
}

function youtubeThumbnail(id: string): string {
  return `https://img.youtube.com/vi/${id}/mqdefault.jpg`;
}

export function VideoCard({ video, layout = 'card', videos, queueType = 'recommended', isActive = false, testID: testIDOverride }: VideoCardProps) {
  const t = useT();
  const { l2Lang } = useLanguage();
  const { playVideo } = useVideoPlayer();
  const profiles = useDifficultyProfile();
  const duration = formatDuration(video.duration);
  const views = formatViews(video.views);
  const level = getLevelFromDifficulty(video.difficulty, profiles?.[l2Lang.code]);
  const levelLabel = level != null ? formatNumericLevel(level, primaryScale(l2Lang.code)).short : null;
  const levelColor = level != null ? (LEVEL_HEX_COLORS[level] ?? '#6b7280') : undefined;
  const thumbnail = youtubeThumbnail(video.youtube_id);
  const testID = testIDOverride ?? `video-card-${video.youtube_id}`;

  const handlePress = () => {
    if (videos && videos.length > 0) {
      playVideo(video, videos, queueType);
      return;
    }
    router.push(`/(tabs)/(media)/watch/${video.youtube_id}` as any);
  };

  if (layout === 'list') {
    return (
      <Pressable
        onPress={handlePress}
        className={`flex-row items-center gap-3 rounded-lg border px-3 py-2 active:bg-muted ${isActive ? 'border-primary bg-primary/5' : 'border-border'}`}
        {...e2e(testID)}
      >
        <View className="relative h-14 w-24">
          <Image source={{ uri: thumbnail }} className="h-14 w-24 rounded-md" />
          {levelLabel && levelColor && (
            <View className="absolute left-0.5 top-0.5 rounded px-1 py-0" style={{ backgroundColor: levelColor }}>
              <Text className="text-[9px] font-bold text-white">{levelLabel}</Text>
            </View>
          )}
        </View>
        <View className="flex-1">
          <Text className={`text-sm font-medium ${isActive ? 'text-primary' : 'text-foreground'}`} numberOfLines={2}>
            {video.title ?? ''}
          </Text>
          <View className="mt-1 flex-row items-center gap-2">
            {views ? <Text className="text-xs text-muted-foreground">{views}</Text> : null}
            {duration ? <Text className="text-xs text-muted-foreground">{duration}</Text> : null}
          </View>
        </View>
        <ChannelActionsMenu channelId={video.channel_id} video={video} />
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={handlePress}
      className="mb-3 overflow-hidden rounded-lg border border-border bg-card active:bg-muted"
      {...e2e(testID)}
    >
      <View className="relative">
        <Image source={{ uri: thumbnail }} className="aspect-video w-full" />
        {levelLabel && levelColor && (
          <View className="absolute left-2 top-2 rounded px-1.5 py-0.5" style={{ backgroundColor: levelColor }}>
            <Text className="text-xs font-bold text-white">{levelLabel}</Text>
          </View>
        )}
        {duration ? (
          <View className="absolute bottom-1 right-1 rounded bg-black/70 px-1.5 py-0.5">
            <Text className="text-xs text-white">{duration}</Text>
          </View>
        ) : null}
      </View>
      <View className="p-2.5">
        <View className="flex-row items-start justify-between gap-1">
          <Text className="flex-1 text-sm font-medium text-foreground" numberOfLines={2}>
            {video.title ?? ''}
          </Text>
          <ChannelActionsMenu channelId={video.channel_id} video={video} />
        </View>
        <View className="mt-1.5 flex-row items-center gap-2">
          {views ? <Text className="text-xs text-muted-foreground">{t('label.views_count', { count: views })}</Text> : null}
        </View>
      </View>
    </Pressable>
  );
}
