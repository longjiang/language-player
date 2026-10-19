import React, { useState } from 'react';
import { View, Text } from 'react-native';
import { router } from 'expo-router';
import { Eye, ThumbsUp, MessageCircle, Calendar, Clock, Tag as TagIcon, MoreHorizontal, ChevronUp } from 'lucide-react-native';
import type { YouTubeVideo } from '@langplayer/shared';
import {
  getLevelFromDifficulty,
  formatNumericLevel,
  primaryScale,
  youTubeCategoryLabel,
  parseVideoTags,
  formatTagSearchQuery,
} from '@langplayer/shared';
import { Pressable } from '@/components/ui/pressable';
import { useLanguage } from '@/contexts/LanguageContext';
import { useT } from '@/hooks/use-t';
import { useDifficultyProfile } from '@/hooks/use-difficulty-profile';
import { ICON_MUTED } from '@/lib/theme-colors';
import { TVShowBadge } from '@/components/video/TVShowBadge';

interface VideoMetaProps {
  video: YouTubeVideo;
}

/** Tags shown before the row collapses behind the "…" button. */
const MAX_VISIBLE_TAGS = 3;

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
  const [tagsExpanded, setTagsExpanded] = useState(false);

  const tags = parseVideoTags(video.tags);
  const visibleTags = tagsExpanded ? tags : tags.slice(0, MAX_VISIBLE_TAGS);

  // A tag pill opens the search screen with a tag query (`?q=%23news`), which
  // the search screen auto-runs as a tag search.
  const openTagSearch = (tag: string) => {
    router.push(
      `/(tabs)/(media)/search?q=${encodeURIComponent(formatTagSearchQuery(tag))}` as any,
    );
  };

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
        {visibleTags.map((tag) => (
          <Pressable
            key={tag}
            onPress={() => openTagSearch(tag)}
            accessibilityRole="button"
            accessibilityLabel={`${t('title.tags')}: ${tag}`}
            className="flex-row items-center gap-1 rounded-full border border-border bg-muted/50 px-3 py-1 active:bg-primary/10"
          >
            <TagIcon size={12} color={ICON_MUTED} />
            <Text className="text-xs text-muted-foreground">{tag}</Text>
          </Pressable>
        ))}
        {tags.length > MAX_VISIBLE_TAGS && (
          <Pressable
            onPress={() => setTagsExpanded((expanded) => !expanded)}
            accessibilityRole="button"
            accessibilityLabel={tagsExpanded ? t('action.show_less') : t('action.show_more')}
            accessibilityState={{ expanded: tagsExpanded }}
            className="flex-row items-center rounded-full border border-border bg-muted/50 px-3 py-1 active:bg-primary/10"
          >
            {tagsExpanded ? (
              <ChevronUp size={12} color={ICON_MUTED} />
            ) : (
              <MoreHorizontal size={12} color={ICON_MUTED} />
            )}
          </Pressable>
        )}
        {video.tv_show && <TVShowBadge tvShowId={String(video.tv_show)} />}
      </View>
    </View>
  );
}
