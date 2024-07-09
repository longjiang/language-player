// @/components/YouTubeVideoCard

import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
} from "react-native";
import { ThemedText } from "./ThemedText";
import { router } from "expo-router";
import { useVideoPlayer } from '@/contexts/VideoPlayerContext';
import { formatDuration } from '@/src/utils';
import { YouTubeVideo } from '@/types';
import { languageLevelsByL2Code } from '@/src/language-levels';
import { useLanguage } from '@/contexts/LanguageContext';
import { youtubeVideoCardStyles as styles } from '@/src/styles';
import { useThemeColorForLevel } from '@/hooks/useThemeColor';
import { Typography } from "@/constants";

export const YouTubeVideoCard = ({ video, videos = [] }: { video: YouTubeVideo; videos: YouTubeVideo[]; style?: object }) => {
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

  return (
    <TouchableOpacity onPress={handlePress} style={{ flex: 1 }}>
      <View style={[styles.card]}>
        <View style={styles.thumbnailContainer}>
          <Image
            source={{
              uri: `https://img.youtube.com/vi/${video.youtube_id}/0.jpg`,
            }}
            style={[styles.thumbnail]}
          />
          {badgeText && level && (
            <View style={{...styles.badge, backgroundColor: useThemeColorForLevel({}, level.level)}}>
              <ThemedText style={{...styles.badgeText }} type="smallBold">{badgeText}</ThemedText>
            </View>
          )}
          {durationText && (
            <View style={styles.durationBadge}>
              <ThemedText style={styles.durationText} type="smallBold">{durationText}</ThemedText>
            </View>
          )}
        </View>
        <View style={styles.infoContainer}>
          <ThemedText style={styles.title} type="defaultBold">
            {video.title}
          </ThemedText>
          <ThemedText style={styles.details} type="small" variant="secondary">
            { [viewsText, localeText].filter(Boolean).join(' • ') }
          </ThemedText>
        </View>
      </View>
    </TouchableOpacity>
  );
};
// Make sure to add these new styles to your youtubeVideoCardStyles