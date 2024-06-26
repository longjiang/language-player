// @/app/components/MiniPlayer.tsx
import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useVideoPlayer } from "@/contexts/VideoPlayerContext";
import { VideoWithTranscript } from "@/components/VideoWithTranscript";
import { useThemeColor } from "@/hooks/useThemeColor";
import { YouTubeVideo } from "@/components/YouTubeVideo";
import { VideoWithTranscriptProvider } from "@/contexts/VideoWithTranscriptContext";

export const MiniPlayer = () => {
  const secondaryBackgroundColor = useThemeColor({}, "secondaryBackground");
  const primaryBrandColor = useThemeColor({}, "primaryBrand");

  const { videoPlayerState } = useVideoPlayer();
  // Only render the component if video is loaded in context and isMini is true
  if (!videoPlayerState.video || !videoPlayerState.isMini) {
    return null;
  }
  return (
    <SafeAreaView style={styles.safeArea}>
      <View
        style={[
          styles.container,
          { backgroundColor: primaryBrandColor },
        ]}
      >
        <VideoWithTranscriptProvider initialVideo={videoPlayerState.video} initialPlaylist={videoPlayerState.queue}>
          <VideoWithTranscript isMini={true} />
        </VideoWithTranscriptProvider>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
  },
  safeArea: {
    position: "absolute",
    bottom: 65,
    width: "100%"
  },
});
