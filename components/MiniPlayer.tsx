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

  const { videoPlayerState, currentVideo, queue, queueType, tvShow, searchTerm } = useVideoPlayer();

  if (!currentVideo) {
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
          initialVideo={currentVideo}
          initialPlaylist={queue}
          isMainPlayer={true}
          queueType={queueType}
          tvShow={tvShow}
          searchTerm={searchTerm}
          key={`video-with-transcript-provider-${currentVideo.youtube_id}-${currentVideo?.subs_l2?.length}`}
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
  },
  safeAreaFull: {
    height: "100%",
  },
});