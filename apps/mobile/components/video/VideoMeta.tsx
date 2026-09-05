import React from 'react';
import { View, Text } from 'react-native';
import { Eye, ThumbsUp, MessageCircle, Calendar, Clock } from 'lucide-react-native';
import type { YouTubeVideo } from '@langplayer/shared';
import { getLevelFromDifficulty, formatNumericLevel, primaryScale, youTubeCategoryLabel } from '@langplayer/shared';
import { useLanguage } from '@/contexts/LanguageContext';
import { useT } from '@/hooks/use-t';
import { useDifficultyProfile } from '@/hooks/use-difficulty-profile';
import { ICON_MUTED } from '@/lib/theme-colors';

interface VideoMetaProps {
  video: YouTubeVideo;
}

function formatNumber(n: number | undefined): string {
  if (!n) return '';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
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
  if (isNaN(num)) return '';
  const mins = Math.floor(num / 60);
  const secs = Math.floor(num % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatDate(date: Date | string | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  const month = d.toLocaleString('en-US', { month: 'short' });
  const day = d.getDate();
  const year = d.getFullYear();
  return `${month} ${day}, ${year}`;
}

export function VideoMeta({ video }: VideoMetaProps) {
  const { l1Lang, l2Lang } = useLanguage();
  const t = useT();
  const profiles = useDifficultyProfile();
  const level = getLevelFromDifficulty(video.difficulty, profiles?.[l2Lang.code]);
  const duration = formatDuration(video.duration);

  return (
    <View>
      <Text className="text-xl font-bold leading-tight text-foreground">
        {video.title ?? t('label.untitled_video_full')}
      </Text>

      <View className="mt-3 flex-row flex-wrap items-center gap-3">
        {video.views != null && (
          <View className="flex-row items-center gap-1">
            <Eye size={14} color={ICON_MUTED} />
            <Text className="text-sm text-muted-foreground">
              {t('label.views_count', { count: formatNumber(video.views) })}
            </Text>
          </View>
        )}
        {duration && (
          <View className="flex-row items-center gap-1">
            <Clock size={14} color={ICON_MUTED} />
            <Text className="text-xs text-muted-foreground">{duration}</Text>
          </View>
        )}
        {video.likes != null && (
          <View className="flex-row items-center gap-1">
            <ThumbsUp size={14} color={ICON_MUTED} />
            <Text className="text-sm text-muted-foreground">{formatNumber(video.likes)}</Text>
          </View>
        )}
        {video.comments != null && (
          <View className="flex-row items-center gap-1">
            <MessageCircle size={14} color={ICON_MUTED} />
            <Text className="text-sm text-muted-foreground">{formatNumber(video.comments)}</Text>
          </View>
        )}
        {video.date && (
          <View className="flex-row items-center gap-1">
            <Calendar size={14} color={ICON_MUTED} />
            <Text className="text-sm text-muted-foreground">{formatDate(video.date)}</Text>
          </View>
        )}
      </View>

      <View className="mt-3 flex-row flex-wrap items-center gap-2">
        {level != null && (
          <View className="rounded-full bg-primary/10 px-3 py-1">
            <Text className="text-xs font-bold text-primary">
              {formatNumericLevel(level, primaryScale(l2Lang.code)).short}
            </Text>
          </View>
        )}
        {video.locale && (
          <View className="rounded-full bg-muted px-3 py-1">
            <Text className="text-xs text-muted-foreground">{video.locale}</Text>
          </View>
        )}
        {video.category && (
          <View className="rounded-full bg-muted px-3 py-1">
            <Text className="text-xs text-muted-foreground">
              {youTubeCategoryLabel(Number(video.category), t, (id) => t('label.category_n', { n: id }))}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}
