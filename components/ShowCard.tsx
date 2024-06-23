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
import { useVideoPlayer } from "@/contexts/VideoPlayerContext";
import { formatDuration } from "@/src/utils";

export const ShowCard = ({ show, style }) => {
  const { showVideoPlayer, toggleMiniPlayer, hideVideoPlayer } =
    useVideoPlayer();

  const handlePress = () => {
    // Navigate to the YouTube video screen
    // Replace 'YouTubeVideoScreen' with the actual name of your screen
    router.navigate(`/video/youtube/${show.youtube_id}`);
  };

  return (
    <TouchableOpacity onPress={handlePress} style={{ flex: 1 }}>
      <View style={[styles.card, style]}>
        <View
          style={[styles.thumbStack, {
            width: "100%", // Makes the image fill the container
            aspectRatio: 16 / 9, // Maintains a 16:9 aspect ratio
            borderRadius: 8,
            transform: [
              { scale: 0.95 },
              { translateX: -6 },
              { translateY: -6 },
            ],
            // Shadow properties for iOS
            shadowColor: "#000",
            shadowOffset: { width: 2, height: 2 },
            shadowOpacity: 1,
            shadowRadius: 3.84,
            // Elevation for Android
            elevation: 5,
          }]}
        >
          <Image
            source={{
              uri: `https://img.youtube.com/vi/${show.youtube_id}/0.jpg`,
            }}
            style={{
              width: "100%", // Makes the image fill the container
              aspectRatio: 16 / 9, // Maintains a 16:9 aspect ratio
              borderRadius: 8,
            }}
          />
        </View>
        <View
          style={[
            styles.thumbStack,
            {
              position: "absolute",
              transform: [
                { scale: 0.95 },
                { translateX: -3 },
                { translateY: -3 },
              ],
              zIndex: -1,
            },
          ]}
        ></View>
        <View
          style={[
            styles.thumbStack,
            {
              position: "absolute",
              transform: [
                { scale: 0.95 },
                { translateX: 0 },
                { translateY: 0 },
              ],
              zIndex: -2,
            },
          ]}
        ></View>
        <View style={styles.infoContainer}>
          <ThemedText style={styles.title} type="defaultBold">
            {show.title}
          </ThemedText>
          <ThemedText style={styles.details} type="small" variant="secondary">
            {`${
              show.avg_views ? show.avg_views.toLocaleString() : "No"
            } Views / ${show.locale}`}
          </ThemedText>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    overflow: "hidden",
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.2,
  },
  thumbStack: {
    width: "100%", // Makes the image fill the container
    aspectRatio: 16 / 9, // Maintains a 16:9 aspect ratio
    borderRadius: 8,
    backgroundColor: "white",
    // Shadow properties for iOS
    shadowColor: "#000",
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 3.84,
  },
  title: {
    marginBottom: 3,
  },
  infoContainer: {
    marginTop: 16,
  },
});
