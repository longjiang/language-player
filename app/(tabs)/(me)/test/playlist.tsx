// @/app/tabs/me/test/playlist

import React from "react";
import { View, StyleSheet } from "react-native";
import { ThemedScreen } from "@/components/ThemedScreen";
import { useThemeColor } from "@/hooks/useThemeColor";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useLanguage } from "@/contexts/LanguageContext";
import { router } from "expo-router";
import { YouTubeVideoList } from "@/components/YouTubeVideoList";

const mockVideos = [
  { youtube_id: "dQw4w9WgXcQ", title: "Never Gonna Give You Up", difficulty: 3 },
  { youtube_id: "kJQP7kiw5Fk", title: "Despacito", difficulty: 5 },
  { youtube_id: "JGwWNGJdvx8", title: "Shape of You", difficulty: 4 },
  { youtube_id: "9bZkp7q19f0", title: "Gangnam Style", difficulty: 6 },
  { youtube_id: "RgKAFK5djSk", title: "See You Again", difficulty: 2 },
];

function Test() {
  const { l2Lang } = useLanguage();
  const secondaryBackgroundColor = useThemeColor({}, "secondaryBackground");

  return (
    <GestureHandlerRootView>
      <ThemedScreen
        title="Test Playlist"
        showFlag={true}
        onBackPress={() => {
          router.back();
        }}
      >
        <View style={styles.container}>
          <YouTubeVideoList videos={mockVideos} variant="horizontal" />
        </View>
      </ThemedScreen>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
});

export default Test;