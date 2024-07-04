// @/components/VideoControlBar.tsx
import React, { useRef, useMemo } from "react";
import { View, StyleSheet, TouchableOpacity } from "react-native";
import { ThemedButton } from "./ThemedButton";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import Ionicon from "react-native-vector-icons/Ionicons";
import { useThemeColor } from "@/hooks/useThemeColor";
import { Swatches } from "@/constants/Swatches";
import { LinearGradient } from "expo-linear-gradient";
import { useVideoWithTranscriptContext } from "@/contexts/VideoWithTranscriptContext";
import { Dimensions } from "react-native";
import { ThemedText } from "./ThemedText";
import { formatDuration } from "@/src/utils";
import { ThemedRBSheet } from "./ThemedRBSheet";
import { videoControlBarStyles as styles } from "@/src/styles";

export const VideoControlBar: React.FC = () => {
  const primaryBrandColor = useThemeColor({}, "primaryBrand");
  const disabledColor = useThemeColor({}, "disabled");
  const {
    video,
    playlist,
    playVideo,
    duration,
    currentTime,
    currentLine,
    syncedLines,
    currentVideoIndex,
    updatePlayVideo,
    seekTo,
    rewind,
    seekToNextLine,
    seekToPreviousLine,
    skipToNextVideo,
    skipToPreviousVideo,
  } = useVideoWithTranscriptContext();

  const handlePress = (evt: { nativeEvent: { locationX: number; }; }) => {
    const { locationX } = evt.nativeEvent;
    const progressBarWidth = Dimensions.get("window").width;
    const newTime = (locationX / progressBarWidth) * duration;
    seekTo(newTime);
  };

  const refRBSheet = useRef<typeof ThemedRBSheet>(null);

  const currentLineIndex = useMemo(() => {
    return syncedLines.findIndex(line => line.starttime === currentLine?.starttime);
  }, [syncedLines, currentLine]);

  const isPreviousLineDisabled = currentLineIndex <= 0;
  const isNextLineDisabled = currentLineIndex >= syncedLines.length - 1;
  const isPreviousVideoDisabled = currentVideoIndex <= 0;
  const isNextVideoDisabled = currentVideoIndex >= playlist.length - 1;

  return (
    <View style={styles.container}>
      <View style={[styles.progressBarContainer, { backgroundColor: useThemeColor({}, 'secondaryBackground') }]}>
        <TouchableOpacity activeOpacity={1} onPress={handlePress}>
          <LinearGradient
            colors={[Swatches.primary[700], Swatches.primary[400]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[
              styles.progressBar,
              {
                width: currentTime && duration
                  ? `${(currentTime / duration) * 100}%`
                  : "0%",
              },
            ]}
          />
        </TouchableOpacity>
      </View>
      <View style={styles.controls}>
        <ThemedButton
          type="ghost"
          trailingIcon={<Icon name="information" />}
          onPress={() => refRBSheet.current?.open()}
        />
        <ThemedButton
          type="ghost"
          trailingIcon={<Icon name="skip-previous" color={isPreviousVideoDisabled ? disabledColor : undefined} />}
          onPress={skipToPreviousVideo}
          disabled={isPreviousVideoDisabled}
        />
        <ThemedButton
          type="ghost"
          trailingIcon={<Icon name="arrow-left" color={isPreviousLineDisabled ? disabledColor : undefined} />}
          onPress={seekToPreviousLine}
          disabled={isPreviousLineDisabled}
        />
        <TouchableOpacity onPress={() => updatePlayVideo(!playVideo)}>
          <Ionicon
            name={playVideo ? "pause" : "play"}
            size={51}
            style={{ color: primaryBrandColor }}
          />
        </TouchableOpacity>
        <ThemedButton
          type="ghost"
          trailingIcon={<Icon name="arrow-right" color={isNextLineDisabled ? disabledColor : undefined} />}
          onPress={seekToNextLine}
          disabled={isNextLineDisabled}
        />
        <ThemedButton
          type="ghost"
          trailingIcon={<Icon name="skip-next" color={isNextVideoDisabled ? disabledColor : undefined} />}
          onPress={skipToNextVideo}
          disabled={isNextVideoDisabled}
        />
        <ThemedButton
          type="ghost"
          trailingIcon={<Icon name="rotate-left" />}
          onPress={rewind}
        />
      </View>
      <ThemedRBSheet ref={refRBSheet}>
        <View>
          <ThemedText type="subtitle">{video.title}</ThemedText>
          <ThemedText variant="secondary" style={{ marginTop: 10 }}>
            {`${video.date instanceof Date ? video.date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'No Date'} / Duration: ${video.duration ? formatDuration(video.duration) : '--:--'} / ${video.locale}`}
          </ThemedText>
          <ThemedText variant="secondary" style={{ marginTop: 10 }}>
            {`${video.views ? video.views.toLocaleString() : '0'} Views / ${video.likes ? video.likes : '0'} likes / ${
              video.comments
            } comments`}
          </ThemedText>
        </View>
      </ThemedRBSheet>
    </View>
  );
};