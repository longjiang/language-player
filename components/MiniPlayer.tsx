// @/app/components/MiniPlayer.tsx
import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useVideoPlayer } from "@/contexts/VideoPlayerContext";
import { VideoWithTranscript } from "@/components/VideoWithTranscript";
import { useThemeColor } from "@/hooks/useThemeColor";
import { YouTubeVideo } from "@/components/YouTubeVideo";
import { VideoWithTranscriptProvider } from "@/contexts/VideoWithTranscriptContext";
import { GestureHandlerRootView } from "react-native-gesture-handler";

export const MiniPlayer = () => {
  const secondaryBackgroundColor = useThemeColor({}, "secondaryBackground");
  const primaryBackgroundColor = useThemeColor({}, "primaryBackground");
  const primaryBrandColor = useThemeColor({}, "primaryBrand");

  const { videoPlayerState, maximizePlayer } = useVideoPlayer();
  // Only render the component if video is loaded in context and isMini is true
  if (!videoPlayerState.video) {
    return null;
  }
  return (
    <SafeAreaView style={{...(videoPlayerState.isMini ? styles.safeAreaMini : styles.safeAreaFull), backgroundColor: videoPlayerState.isMini ? primaryBrandColor : primaryBackgroundColor }}>
      <GestureHandlerRootView>
        <View>
          <VideoWithTranscriptProvider
            initialVideo={ videoPlayerState.video }
            initialPlaylist={ videoPlayerState.queue }
            isMainPlayer={true}
            key={`video-with-transcript-provider-${videoPlayerState.video.youtube_id}-${videoPlayerState?.video?.subs_l2?.length}`}
          >
            <VideoWithTranscript
              isMini={ videoPlayerState.isMini }
              showHeader={ !videoPlayerState.isMini }
            />
          </VideoWithTranscriptProvider>
        </View>
      </GestureHandlerRootView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeAreaMini: {
    position: "absolute",
    bottom: 65,
    width: "100%"
  },
  safeAreaFull: {
    width: "100%",
    height: "100%",
    position: "absolute",
  },
});
