// @/components/YouTubeVideoCard.tsx

import React from "react";
import {
  View,
  StyleSheet,
  Image,
  TouchableOpacity,
} from "react-native";
import { ThemedText } from "./ThemedText";
import { useVideoPlayer } from '@/contexts/VideoPlayerContext';
import { formatDuration } from '@/src/utils';
import { YouTubeVideo } from '@/types';
import { languageLevelsByL2Code } from '@/src/language-levels';
import { useLanguage } from '@/contexts/LanguageContext';
import { youtubeVideoCardStyles } from '@/src/styles';
import { useThemeColorForLevel } from '@/hooks/useThemeColor';
import { useThemeColor } from "@/hooks/useThemeColor";

export const YouTubeVideoCard = ({ 
  video, 
  videos = [], 
  variant = 'vertical',
  isCurrentVideo = false,
  style = {},
  queueType = 'recommended',
  tvShow,
  searchTerm,
  showDetails = true,
}: { 
  video: YouTubeVideo; 
  videos: YouTubeVideo[]; 
  variant?: 'vertical' | 'horizontal';
  isCurrentVideo?: boolean;
  style?: object;
  queueType?: 'recommended' | 'tvShow' | 'search';
  tvShow?: {id: string, title: string, episodes: YouTubeVideo[]};
  searchTerm?: string;
  showDetails?: boolean;
}) => {
  if (videos.length === 0) videos = [video];
  const { setVideoAndQueue } = useVideoPlayer();
  const { l2Lang, t } = useLanguage();
  const accent1Color = useThemeColor({}, 'accent1');
  if (!l2Lang) return null;

  const handlePress = () => {
    setVideoAndQueue(video, videos, queueType, queueType === 'tvShow' ? tvShow : searchTerm);
  };

  const viewsText = video.views ? t('title.views', {numViews: video.views?.toLocaleString()}) : '';
  const durationText = video.duration ? formatDuration(video.duration) : '';
  const localeText = video.locale ? t('lang.' + video.locale) : '';

  const levels = languageLevelsByL2Code(l2Lang.code); 
  const videoDifficulty = video.difficulty || 1;
  const level = Object.values(levels).find(l => videoDifficulty <= l.maxDifficulty);
  const badgeText = level ? level.examLevelName : '';

  const cardStyle = [
    styles.card,
    variant === 'horizontal' ? styles.horizontalCard : styles.verticalCard,
    isCurrentVideo && { backgroundColor: accent1Color }
  ];
  const thumbnailStyle = variant === 'horizontal' ? styles.horizontalThumbnail : styles.verticalThumbnail;
  const infoContainerStyle = variant === 'horizontal' ? styles.horizontalInfoContainer : styles.verticalInfoContainer;

  return (
    <TouchableOpacity onPress={handlePress}>
      <View style={[...cardStyle, {flex: 1, ...style }]}>
        <View style={styles.thumbnailContainer}>
          <Image
            source={{
              uri: `https://img.youtube.com/vi/${video.youtube_id}/0.jpg`,
            }}
            style={[styles.thumbnail, thumbnailStyle]}
          />
          {badgeText && level && (
            <View style={{...(variant === 'horizontal' ? styles.smallLevelBadge : styles.levelBadge), backgroundColor: useThemeColorForLevel({}, level.level)}}>
              <ThemedText style={{...styles.badgeText }} type={ variant === 'horizontal' ? 'xxsmallBold' : 'smallBold'}>{badgeText}</ThemedText>
            </View>
          )}
          {durationText && (
            <View style={styles.durationBadge}>
              <ThemedText style={styles.durationText} type="smallBold">{durationText}</ThemedText>
            </View>
          )}
        </View>
        <View style={[styles.infoContainer, infoContainerStyle]}>
          <ThemedText style={styles.title} type="defaultBold" numberOfLines={2}>
            {video.title}
          </ThemedText>
          {showDetails && <ThemedText style={styles.details} type="small" variant="secondary">
            { [viewsText, localeText].filter(Boolean).join(' • ') }
          </ThemedText>}
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  ...youtubeVideoCardStyles,
  horizontalCard: {
    flexDirection: 'row',
    height: 55,
    alignItems: 'center',
    padding: 6,
    borderRadius: 8,
  },
  verticalCard: {
    flexDirection: 'column',
  },
  horizontalThumbnail: {
    width: 76, // 16:9 aspect ratio of 43px height
    height: 43,
    borderRadius: 4,
  },
  verticalThumbnail: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: 8,
  },
  horizontalInfoContainer: {
    marginLeft: 12,
    flex: 1,
  },
  verticalInfoContainer: {
    marginTop: 16,
  },
  smallLevelBadge: {
    position: 'absolute',
    top: 4,
    left: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 2,
  },
});