// @/components/YouTubeVideoCard

import React from "react";
import {
  View,
  Image,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { ThemedText } from "./ThemedText";
import { useVideoPlayer } from '@/contexts/VideoPlayerContext';
import { formatDuration } from '@/src/utils';
import { YouTubeVideo } from '@/types';
import { languageLevelsByL2Code } from '@/src/language-levels';
import { useLanguage } from '@/contexts/LanguageContext';
import { useThemeColorForLevel } from '@/hooks/useThemeColor';
import { Typography } from '@/constants/Typography';

export const YouTubeVideoCard = ({ 
  video, 
  videos = [], 
  variant = 'vertical' 
}: { 
  video: YouTubeVideo; 
  videos: YouTubeVideo[]; 
  variant?: 'vertical' | 'horizontal';
  style?: object 
}) => {
  if (videos.length === 0) videos = [video];
  const { setVideoAndQueue } = useVideoPlayer();
  const { l2Lang, t } = useLanguage();
  if (!l2Lang) return null;

  const handlePress = () => {
    setVideoAndQueue(video, videos);
  };

  const viewsText = video.views ? t('title.views', {numViews: video.views?.toLocaleString()}) : '';
  const durationText = video.duration ? formatDuration(video.duration) : '';
  const localeText = video.locale ? t('lang.' + video.locale) : '';

  const levels = languageLevelsByL2Code(l2Lang.code); 
  const videoDifficulty = video.difficulty || 1;
  const level = Object.values(levels).find(l => videoDifficulty <= l.maxDifficulty);
  const badgeText = level ? level.examLevelName : '';

  const isHorizontal = variant === 'horizontal';

  return (
    <TouchableOpacity onPress={handlePress} style={{ flex: 1 }}>
      <View style={[
        styles.card,
        isHorizontal && styles.horizontalCard
      ]}>
        <View style={[
          styles.thumbnailContainer,
          isHorizontal && styles.horizontalThumbnailContainer
        ]}>
          <Image
            source={{
              uri: `https://img.youtube.com/vi/${video.youtube_id}/0.jpg`,
            }}
            style={[
              styles.thumbnail,
              isHorizontal && styles.horizontalThumbnail
            ]}
          />
          {badgeText && level && (
            <View style={{
              ...styles.badge,
              ...(isHorizontal && styles.horizontalBadge),
              backgroundColor: useThemeColorForLevel({}, level.level),
            }}>
              <ThemedText style={styles.badgeText} type="smallBold">{badgeText}</ThemedText>
            </View>
          )}
          {durationText && (
            <View style={[
              styles.durationBadge,
              isHorizontal && styles.horizontalDurationBadge
            ]}>
              <ThemedText style={styles.durationText} type="smallBold">{durationText}</ThemedText>
            </View>
          )}
        </View>
        <View style={[
          styles.infoContainer,
          isHorizontal && styles.horizontalInfoContainer
        ]}>
          <ThemedText 
            style={[styles.title, isHorizontal && styles.horizontalTitle]} 
            type="defaultBold"
            numberOfLines={isHorizontal ? 2 : undefined}
          >
            {video.title}
          </ThemedText>
          <ThemedText 
            style={[styles.details, isHorizontal && styles.horizontalDetails]} 
            type="small" 
            variant="secondary"
          >
            { [viewsText, localeText].filter(Boolean).join(' • ') }
          </ThemedText>
        </View>
      </View>
    </TouchableOpacity>
  );
};

export const youtubeVideoCardStyles = StyleSheet.create({
  details: {
    // Existing styles
  },
  card: {
    overflow: "hidden",
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.2,
  },
  thumbnailContainer: {
    position: 'relative',
  },
  thumbnail: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: 8,
  },
  title: {
    marginBottom: 3,
  },
  infoContainer: {
    marginTop: 16,
  },
  badge: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: '#6c757d',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  badgeText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  durationBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  durationText: {
    color: 'white',
  },

  // New styles for horizontal layout
  horizontalCard: {
    flexDirection: 'row',
    height: 43,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  horizontalThumbnailContainer: {
    width: 76, // 16:9 aspect ratio for 43px height
    height: 43,
    marginRight: 12,
  },
  horizontalThumbnail: {
    width: '100%',
    height: '100%',
    borderRadius: 4,
  },
  horizontalInfoContainer: {
    flex: 1,
    marginTop: 0,
    justifyContent: 'center',
  },
  horizontalTitle: {
    fontSize: Typography.smallFontSize,
    lineHeight: Typography.smallLineHeight,
    marginBottom: 2,
  },
  horizontalDetails: {
    fontSize: Typography.smallestFontSize,
    lineHeight: Typography.smallestLineHeight,
  },
  horizontalBadge: {
    bottom: 4,
    left: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 2,
  },
  horizontalDurationBadge: {
    bottom: 4,
    right: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 2,
  },
});

const styles = youtubeVideoCardStyles