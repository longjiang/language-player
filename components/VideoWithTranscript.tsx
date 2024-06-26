// @/components/VideoWithTranscript.tsx

import React from "react";
import { SafeAreaView, View, Text } from "react-native";
import { ThemedButton } from "./ThemedButton";
import { YouTubeVideo } from "./YouTubeVideo";
import { VideoControlBar } from "./VideoControlBar";
import { SyncedTranscript } from "./SyncedTranscript";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import Ionicon from "react-native-vector-icons/Ionicons";
import { router, Link } from "expo-router";
import { Dimensions } from "react-native";
import { VideoWithTranscriptProvider } from "@/contexts/VideoWithTranscriptContext";
import { YouTubeVideo as YouTubeVideoType } from "@/types";
import { StyleSheet } from "react-native";
import { useVideoWithTranscriptContext } from "@/contexts/VideoWithTranscriptContext";
import { useThemeColor } from "@/hooks/useThemeColor";
import { Swatches } from "@/constants/Swatches";
import { ThemedText } from "./ThemedText";
import { formatDuration } from "@/src/utils";
import { useVideoPlayer } from "@/contexts/VideoPlayerContext";
import {
  GestureHandlerRootView,
  TouchableOpacity,
} from "react-native-gesture-handler";

interface VideoWithTranscriptProps {
  isMini: boolean;
  showHeader?: boolean;
}

export const VideoWithTranscript: React.FC<VideoWithTranscriptProps> = ({
  isMini,
  showHeader = false,
}) => {
  const screenWidth = Dimensions.get("window").width;
  const videoHeight = screenWidth * 0.5625; // 16:9 aspect ratio
  const primaryBrandColor = useThemeColor({}, "primaryBrand");

  const { video, playVideo, updatePlayVideo, currentTime, startTime } =
    useVideoWithTranscriptContext();
  const { closePlayer } = useVideoPlayer();

  function removeTextInBrackets(text: string) {
    // Regular expression to match content inside various brackets
    const regex = /[\(\[\{［【｛].*?[\)\]\}］】｝]/g;
    return text.replace(regex, "");
  }

  if (!video) {
    return null;
  }

  return (
    <View>
      {!isMini && (
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
                <ThemedButton
                  type="ghost"
                  style={styles.headerButton}
                  trailingIcon={<Icon name="text-long" />}
                  onPress={() => router.push("/(tabs)/(media)/youtube-video")}
                />
                <ThemedButton
                  type="ghost"
                  style={styles.headerButton}
                  trailingIcon={<Icon name="cog-outline" />}
                  onPress={() => router.push("/(tabs)/(media)/youtube-video")}
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
            <SyncedTranscript video={video} />
          </View>
        </View>
      )}
      {isMini && (
        <View style={styles.miniPlayerContainer}>
          <View style={styles.miniPlayerVideoContainer}>
            <YouTubeVideo
              youtubeId={video.youtube_id}
              height={70}
              controls={false}
              startTime={startTime}
            />
          </View>
          <Link href={`/video/youtube/${video.youtube_id}`} style={{ marginLeft: 10, flex: 1 }}>
            <View style={styles.miniPlayerVideoInfo}>
              {video.title && <ThemedText
                style={styles.miniPlayerVideoTitle}
                numberOfLines={1}
                type="defaultBold"
              >
                {removeTextInBrackets(video.title)}
              </ThemedText>}
              <ThemedText
                style={styles.miniPlayerVideoSubTitle}
                numberOfLines={1}
                type="small"
              >
                {formatDuration(currentTime)}
              </ThemedText>
            </View>
          </Link>
          <View style={styles.miniPlayerControlsContainer}>
            <Ionicon
              name={playVideo ? "pause" : "play"}
              size={26}
              style={{ color: Swatches.neutral[0] }}
              onPress={() => updatePlayVideo(!playVideo)}
            />
            <Ionicon
              name="close"
              size={26}
              style={{ color: Swatches.neutral[0], marginLeft: 10 }}
              onPress={closePlayer}
            />
          </View>
        </View>
      )}
    </View>
  );
};

// Create stylesheet
const styles = StyleSheet.create({
  headerButton: { padding: 8 },
  header: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8 },
  miniPlayerVideoInfo: {
    overflow: "hidden", // Ensures overflow is hidden
  },
  miniPlayerVideoTitle: { fontSize: 14, color: Swatches.neutral[0] },
  miniPlayerVideoSubTitle: { fontSize: 12, color: Swatches.neutral[0] },
  fullPlayerContainer: { marginBottom: 26 },
  miniPlayerContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  miniPlayerVideoContainer: {
    width: 70 * 1.777777777777778,
  },
  miniPlayerControlsContainer: {
    paddingHorizontal: 13,
    flexDirection: "row",
  },
});
