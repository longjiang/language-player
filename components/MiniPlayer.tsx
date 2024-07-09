// @/components/MiniPlayer.tsx

import React from "react";
import { View, StyleSheet } from "react-native";
import { useVideoPlayer } from "@/contexts/VideoPlayerContext";
import { VideoWithTranscript } from "@/components/VideoWithTranscript";
import { useThemeColor } from "@/hooks/useThemeColor";
import { VideoWithTranscriptProvider } from "@/contexts/VideoWithTranscriptContext";
import { GestureHandlerRootView } from "react-native-gesture-handler";

export const MiniPlayer = () => {
  const primaryBackgroundColor = useThemeColor({}, "primaryBackground");
  const primaryBrandColor = useThemeColor({}, "primaryBrand");

  const { videoPlayerState } = useVideoPlayer();

  if (!videoPlayerState.video) {
    return null;
  }

  return (
    <GestureHandlerRootView 
      style={{
        ...(videoPlayerState.isMini ? styles.safeAreaMini : styles.safeAreaFull), 
        backgroundColor: videoPlayerState.isMini ? primaryBrandColor : primaryBackgroundColor 
      }}
    >
      <View>
        <VideoWithTranscriptProvider
          initialVideo={videoPlayerState.video}
          initialPlaylist={videoPlayerState.queue}
          isMainPlayer={true}
          key={`video-with-transcript-provider-${videoPlayerState.video.youtube_id}-${videoPlayerState?.video?.subs_l2?.length}`}
        >
          <VideoWithTranscript
            isMini={videoPlayerState.isMini}
            showHeader={!videoPlayerState.isMini}
          />
        </VideoWithTranscriptProvider>
      </View>
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  safeAreaMini: {
    position: "absolute",
    bottom: 100,
    width: "100%"
  },
  safeAreaFull: {
    width: "100%",
    height: "100%",
    position: "absolute",
  },
});