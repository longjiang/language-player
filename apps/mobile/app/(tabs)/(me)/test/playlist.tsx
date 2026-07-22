// @/app/tabs/me/test/playlist

import React from "react";
import { View, StyleSheet } from "react-native";
import { ThemedScreen } from "@/components/ThemedScreen";
import { useThemeColor } from "@/hooks/useThemeColor";
import { useLanguage } from "@/contexts/LanguageContext";
import { router } from "expo-router";
import { YouTubeVideoList } from "@/components/YouTubeVideoList";
import { useVideoPlayer } from "@/contexts/VideoPlayerContext";

const mockVideos = [
  { youtube_id: "dQw4w9WgXcQ", title: "Never Gonna Give You Up", difficulty: 0.003 },
  { youtube_id: "kJQP7kiw5Fk", title: "Despacito", difficulty: 0.005 },
  { youtube_id: "JGwWNGJdvx8", title: "Shape of You", difficulty: 0.004 },
  { youtube_id: "9bZkp7q19f0", title: "Gangnam Style", difficulty: 0.006 },
  { youtube_id: "RgKAFK5djSk", title: "See You Again", difficulty: 0.002 },
];

function Test() {
  const { l2Lang } = useLanguage();
  const secondaryBackgroundColor = useThemeColor({}, "secondaryBackground");
  const { currentVideo } = useVideoPlayer();

  return (
    <View>
      <ThemedScreen
        title="Test Playlist"
        showFlag={true}
        onBackPress={() => {
          router.back();
        }}
      >
        <View style={styles.container}>
          <YouTubeVideoList videos={mockVideos} variant="horizontal" currentVideoId={ currentVideo ? currentVideo.youtube_id : undefined }/>
        </View>
      </ThemedScreen>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    // You can add any additional styles here if needed
  },
});

export default Test;