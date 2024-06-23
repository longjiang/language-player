// @/components/VideoWithTranscript.tsx

import React from "react";
import { SafeAreaView, View } from "react-native";
import { ThemedButton } from "./ThemedButton";
import { YouTubeVideo } from "./YouTubeVideo";
import { VideoControlBar } from "./VideoControlBar";
import { SyncedTranscript } from "./SyncedTranscript";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { router } from "expo-router";
import { Dimensions } from "react-native";
import { VideoWithTranscriptProvider } from "@/contexts/VideoWithTranscriptContext";
import { YouTubeVideo as YouTubeVideoType } from "@/types";
import { useVideoPlayer } from "@/contexts/VideoPlayerContext";
import { StyleSheet } from "react-native";

interface VideoWithTranscriptProps {
  router: any; // Adjust the type according to your router's type
  initialVideo: YouTubeVideoType;
}

export const VideoWithTranscript: React.FC<VideoWithTranscriptProps> = ({
  video,
}) => {
  if (!video) return null;

  const {
    openPlayer,
    closePlayer,
    minimizePlayer,
    maximizePlayer,
    setYouTubeId,
    videoPlayerState,
  } = useVideoPlayer();

  const screenWidth = Dimensions.get("window").width;
  const videoHeight = screenWidth * 0.5625; // 16:9 aspect ratio

  return (
    <VideoWithTranscriptProvider initialVideo={video}>
      {!videoPlayerState.isMini && (
        <SafeAreaView style={styles.header}>
          <View>
            <ThemedButton
              type="ghost"
              trailingIcon={<Icon name="chevron-down" />}
              onPress={() => router.push("../")}
            />
          </View>
          <View style={{ flexDirection: "row" }}>
            <ThemedButton
              type="ghost"
              trailingIcon={<Icon name="text-long" />}
              onPress={() => router.push("/(tabs)/(media)/youtube-video")}
            />
            <ThemedButton
              type="ghost"
              trailingIcon={<Icon name="cog-outline" />}
              onPress={() => router.push("/(tabs)/(media)/youtube-video")}
            />
          </View>
        </SafeAreaView>
      )}
      <View
        style={
          videoPlayerState.isMini ? styles.containerMini : styles.containerFull
        }
      >
        <YouTubeVideo
          youtubeId={video.youtube_id}
          height={videoHeight}
          controls={false}
        />
        <VideoControlBar />
      </View>
      {!videoPlayerState.isMini && <SyncedTranscript video={video} />}
    </VideoWithTranscriptProvider>
  );
};

// Create stylesheet
const styles = StyleSheet.create({
  header: { flexDirection: "row", justifyContent: "space-between" },
  containerFull: { marginBottom: 26 },
  containerMini: { padding: 0, marginBottom: 0 },
});
