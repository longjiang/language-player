import React from 'react';
import { View, Text, Pressable, Image } from 'react-native';
import { router } from 'expo-router';
import type { YouTubeVideo } from '@langplayer/shared';
import { useT } from '@/hooks/use-t';

interface VideoCardProps {
  video: YouTubeVideo;
  layout?: 'card' | 'list';
}

function formatDuration(seconds: number | string | undefined): string {
  if (seconds == null || seconds === '') return '';
  const num = typeof seconds === 'string' ? parseFloat(seconds) : seconds;
  if (isNaN(num)) return '';
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

export function VideoCard({ video, layout = 'card' }: VideoCardProps) {
  const t = useT();
  const duration = formatDuration(video.duration);
  const views = formatViews(video.views);
  const level = video.difficulty != null ? video.difficulty : null;
  const levelText = level != null ? `L${Math.round(level)}` : null;
  const thumbnail = youtubeThumbnail(video.youtube_id);

  const handlePress = () => {
    router.push(`/(tabs)/(media)/watch/${video.youtube_id}` as any);
  };

  if (layout === 'list') {
    return (
      <Pressable
        onPress={handlePress}
        className="flex-row items-center gap-3 rounded-lg border border-border px-3 py-2 active:bg-muted"
      >
        <Image source={{ uri: thumbnail }} className="h-14 w-24 rounded-md" />
        <View className="flex-1">
          <Text className="text-sm font-medium text-foreground" numberOfLines={2}>
            {video.title ?? ''}
          </Text>
          <View className="mt-1 flex-row items-center gap-2">
            {levelText && (
              <View className="rounded bg-primary/10 px-1.5 py-0.5">
                <Text className="text-xs font-bold text-primary">{levelText}</Text>
              </View>
            )}
            {views ? <Text className="text-xs text-muted-foreground">{views}</Text> : null}
            {duration ? <Text className="text-xs text-muted-foreground">{duration}</Text> : null}
          </View>
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable onPress={handlePress} className="mb-3 overflow-hidden rounded-lg border border-border bg-card active:bg-muted">
      <View className="relative">
        <Image source={{ uri: thumbnail }} className="aspect-video w-full" />
        {duration ? (
          <View className="absolute bottom-1 right-1 rounded bg-black/70 px-1.5 py-0.5">
            <Text className="text-xs text-white">{duration}</Text>
          </View>
        ) : null}
      </View>
      <View className="p-2.5">
        <Text className="text-sm font-medium text-foreground" numberOfLines={2}>
          {video.title ?? ''}
        </Text>
        <View className="mt-1.5 flex-row items-center gap-2">
          {levelText && (
            <View className="rounded bg-primary/10 px-1.5 py-0.5">
              <Text className="text-xs font-bold text-primary">{levelText}</Text>
            </View>
          )}
          {views ? <Text className="text-xs text-muted-foreground">{t('label.views_count', { count: views })}</Text> : null}
        </View>
      </View>
    </Pressable>
  );
}
