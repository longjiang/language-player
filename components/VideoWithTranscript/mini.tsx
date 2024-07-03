// @/components/VideoWithTranscript/mini.tsx

import React from "react";
import { View } from "react-native";
import { YouTubeVideo } from "../YouTubeVideo";
import { Link } from "expo-router";
import Ionicon from "react-native-vector-icons/Ionicons";
import { useVideoWithTranscriptContext } from "@/contexts/VideoWithTranscriptContext";
import { Swatches } from "@/constants/Swatches";
import { ThemedText } from "../ThemedText";
import { formatDuration } from "@/src/utils";
import { useVideoPlayer } from "@/contexts/VideoPlayerContext";
import { videoWithTranscriptStyles as styles } from "@/src/styles";

export const VideoWithTranscriptMini: React.FC = () => {
  const { video, playVideo, updatePlayVideo, currentTime } = useVideoWithTranscriptContext();
  const { closePlayer } = useVideoPlayer();

  function removeTextInBrackets(text: string) {
    const regex = /[\(\[\{［【｛].*?[\)\]\}］】｝]/g;
    return text.replace(regex, "");
  }

  if (!video) {
    return null;
  }

  return (
    <View style={styles.miniPlayerContainer}>
      <View style={styles.miniPlayerVideoContainer}>
        <YouTubeVideo
          youtubeId={video.youtube_id}
          height={70}
          controls={false}
          startTime={0}
        />
      </View>
      <Link href={`/video/youtube/${video.youtube_id}`} style={{ marginLeft: 10, flex: 1 }}>
        <View style={styles.miniPlayerVideoInfo}>
          {video.title && (
            <ThemedText
              style={styles.miniPlayerVideoTitle}
              numberOfLines={1}
              type="defaultBold"
            >
              {removeTextInBrackets(video.title)}
            </ThemedText>
          )}
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
  );
};
