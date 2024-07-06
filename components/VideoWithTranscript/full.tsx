// @/components/VideoWithTranscript/full.tsx

import React from "react";
import { SafeAreaView, View } from "react-native";
import { ThemedButton } from "../ThemedButton";
import { YouTubeVideo } from "../YouTubeVideo";
import { VideoControlBar } from "../VideoControlBar";
import { SyncedTranscript } from "../SyncedTranscript";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { router } from "expo-router";
import { Dimensions } from "react-native";
import { useVideoWithTranscriptContext } from "@/contexts/VideoWithTranscriptContext";
import { videoWithTranscriptStyles as styles } from "@/src/styles";
import { useVideoPlayer } from "@/contexts/VideoPlayerContext";

interface VideoWithTranscriptFullProps {
  showHeader?: boolean;
}

export const VideoWithTranscriptFull: React.FC<VideoWithTranscriptFullProps> = ({ showHeader = false, transcriptLimitReached = false }) => {
  const screenWidth = Dimensions.get("window").width;
  const videoHeight = screenWidth * 0.5625; // 16:9 aspect ratio

  const { video, startTime } = useVideoWithTranscriptContext();
  const { minimizePlayer } = useVideoPlayer();

  if (!video) {
    return null;
  }

  return (
    <View>
      {showHeader && (
        <SafeAreaView style={styles.header}>
          <View>
            <ThemedButton
              type="ghost"
              style={styles.headerButton}
              trailingIcon={<Icon name="chevron-down" />}
              onPress={() => router.push("../")}
            />
          </View>
          <View style={{ flexDirection: "row" }}>
            {/* <ThemedButton
              type="ghost"
              style={styles.headerButton}
              trailingIcon={<Icon name="text-long" />}
              onPress={() => {
                // Handle transcript button press
              }}
            /> */}
            <ThemedButton
              type="ghost"
              style={styles.headerButton}
              trailingIcon={<Icon name="cog-outline" />}
              onPress={() => {
                minimizePlayer();
                router.navigate("/(tabs)/(me)/settings");
              }}
            />
          </View>
        </SafeAreaView>
      )}
      <View style={styles.fullPlayerContainer}>
        <YouTubeVideo
          youtubeId={video.youtube_id}
          height={videoHeight}
          controls={false}
          startTime={startTime}
        />
        <VideoControlBar />
        <View style={{ paddingHorizontal: 26 }}>
            <SyncedTranscript transcriptLimitReached={transcriptLimitReached} />
        </View>
      </View>
    </View>
  );
};
