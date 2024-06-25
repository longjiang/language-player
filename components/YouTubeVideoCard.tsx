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

export const YouTubeVideoCard = ({ video }: { video: YouTubeVideo; style?: object }) => {


  const handlePress = () => {
    // Navigate to the YouTube video screen
    // Replace 'YouTubeVideoScreen' with the actual name of your screen
    router.navigate(`/video/youtube/${video.youtube_id}`);
  };

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
            {`${video.views ? video.views.toLocaleString() : 'No'} Views / ${video.duration ? formatDuration(
              video.duration
            ) : '--:--'} / ${video.locale}`}
          </ThemedText>
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
});
