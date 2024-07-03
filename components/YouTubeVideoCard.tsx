// @/components/YouTubeVideoCard

import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  Dimensions,
} from "react-native";
import { ThemedText } from "./ThemedText";
import { router } from "expo-router";
import { useVideoPlayer } from '@/contexts/VideoPlayerContext';
import { formatDuration } from '@/src/utils';
import { YouTubeVideo } from '@/types';
import { languageLevelsByL2Code } from '@/src/language-levels';
import { useLanguage } from '@/contexts/LanguageContext';

export const YouTubeVideoCard = ({ video, videos = [] }: { video: YouTubeVideo; videos: YouTubeVideo[]; style?: object }) => {
  if (videos.length === 0) videos = [video];
  const { setVideoPlayerState } = useVideoPlayer();
  const { l2Lang } = useLanguage();
  if (!l2Lang) return null;

  const handlePress = () => {
    // Set the current video and queue in the global state
    setVideoPlayerState(state => ({
      ...state,
      video: video, // set the current video
      queue: videos // set the full list of videos
    }));
  
    // Navigate to the YouTube video screen
    router.navigate(`/video/youtube/${video.youtube_id}`);
  };

  const viewsText = video.views?.toLocaleString() || '';
  const durationText = video.duration ? formatDuration(video.duration) : '';
  const localeText = video.locale || '';

  // Determine the CEFR level based on the video's difficulty
  const levels = languageLevelsByL2Code(l2Lang.code); 
  const videoDifficulty = video.difficulty || 1; // Replace with actual difficulty value from video data
  const level = Object.values(levels).find(l => videoDifficulty <= l.maxDifficulty);
  const badgeText = level ? level.examLevelName : '';

  return (
    <TouchableOpacity onPress={handlePress} style={{ flex: 1 }}>
      <View style={[styles.card]}>
        <Image
          source={{
            uri: `https://img.youtube.com/vi/${video.youtube_id}/0.jpg`,
          }}
          style={[styles.thumbnail]}
        />
        <View style={styles.infoContainer}>
          <ThemedText style={styles.title} type="defaultBold">
            {video.title}
          </ThemedText>
          <ThemedText style={styles.details} type="small" variant="secondary">
            { [viewsText, durationText, localeText].filter(Boolean).join(' • ') }
          </ThemedText>
          {badgeText && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{badgeText}</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  details: {
  },
  card: {
    overflow: "hidden",
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.2,
  },
  thumbnail: {
    width: "100%", // Makes the image fill the container
    aspectRatio: 16 / 9, // Maintains a 16:9 aspect ratio
    borderRadius: 8,
  },
  title: {
    marginBottom: 3,
  },
  infoContainer: {
    marginTop: 16,
  },
  badge: {
    backgroundColor: '#6c757d',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
});
