// @/app/tabs/me/test/playlist

import React, { useState } from "react";
import { View, StyleSheet } from "react-native";
import { ThemedScreen } from "@/components/ThemedScreen";
import { useThemeColor } from "@/hooks/useThemeColor";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useLanguage } from "@/contexts/LanguageContext";
import { router } from "expo-router";
import { YouTubeVideoList } from "@/components/YouTubeVideoList";
import { ThemedButton } from "@/components/ThemedButton";

const mockVideos = [
  { youtube_id: "dQw4w9WgXcQ", title: "Never Gonna Give You Up", level: 3 },
  { youtube_id: "9bZkp7q19f0", title: "Gangnam Style", level: 4 },
  { youtube_id: "kJQP7kiw5Fk", title: "Despacito", level: 5 },
  { youtube_id: "JGwWNGJdvx8", title: "Shape of You", level: 2 },
  { youtube_id: "RgKAFK5djSk", title: "See You Again", level: 3 },
];

function Test() {
  const { l2Lang } = useLanguage();
  const secondaryBackgroundColor = useThemeColor({}, "secondaryBackground");
  const [variant, setVariant] = useState<'vertical' | 'horizontal'>('vertical');

  return (
    <GestureHandlerRootView>
      <ThemedScreen
        title="Test"
        showFlag={true}
        onBackPress={() => {
          router.back();
        }}
      >
        <View style={styles.container}>
          <ThemedButton
            onPress={() => setVariant(variant === 'vertical' ? 'horizontal' : 'vertical')}
            title={`Switch to ${variant === 'vertical' ? 'Horizontal' : 'Vertical'}`}
            style={styles.button}
          />
          <YouTubeVideoList
            videos={mockVideos}
            variant={variant}
            style={styles.videoItem}
          />
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
  button: {
    marginBottom: 16,
  },
  videoItem: {
    marginBottom: 16,
  },
});

export default Test;