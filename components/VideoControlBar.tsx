// @/components/VideoControlBar.tsx
import React, { useRef } from "react";
import { View, StyleSheet, TouchableOpacity } from "react-native";
import { ThemedButton } from "./ThemedButton"; // Assuming you have this component
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import Ionicon from "react-native-vector-icons/Ionicons";
import { useThemeColor } from "@/hooks/useThemeColor";
import { Swatches } from "@/constants/Swatches";
import { LinearGradient } from "expo-linear-gradient";
import { useVideoWithTranscriptContext } from "@/contexts/VideoWithTranscriptContext";
import { Dimensions } from "react-native";
import RBSheet from "react-native-raw-bottom-sheet";
import { ThemedText } from "./ThemedText";
import { ThemedView } from "./ThemedView";
import { formatDuration } from "@/src/utils";
import { ThemedRBSheet } from "./ThemedRBSheet";

export const VideoControlBar: React.FC = () => {
  const primaryBrandColor = useThemeColor({}, "primaryBrand");
  const secondaryBackgroundColor = useThemeColor({}, "secondaryBackground");
  const {
    video,
    playVideo,
    duration,
    currentTime,
    fullscreen,
    updateFullscreen,
    updatePlayVideo,
    seekTo,
    rewind,
    seekToNextLine,
    seekToPreviousLine,
    skipToNextVideo,
    skipToPreviousVideo,
  } = useVideoWithTranscriptContext();

  const handlePress = (evt: { nativeEvent: { locationX: any; }; }) => {
    const { locationX } = evt.nativeEvent;
    const progressBarWidth = Dimensions.get("window").width; // Assuming full width, adjust as necessary
    const newTime = (locationX / progressBarWidth) * duration;
    seekTo(newTime);
  };

  const refRBSheet = useRef<typeof ThemedRBSheet>(null);
  
  return (
    <View style={styles.container}>
      <View style={styles.progressBarContainer}>
        <View />
        <TouchableOpacity activeOpacity={1} onPress={handlePress}>
          <LinearGradient
            colors={[Swatches.primary[700], Swatches.primary[400]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[
              styles.progressBar,
              {
                width:
                  currentTime && duration
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
          onPress={() => refRBSheet.current ? refRBSheet.current.open() : null}
        />
        <ThemedButton
          type="ghost"
          trailingIcon={<Icon name="skip-previous" />}
          onPress={skipToPreviousVideo}
        />
        <ThemedButton
          type="ghost"
          trailingIcon={<Icon name="arrow-left" />}
          onPress={seekToPreviousLine}
        />
        <TouchableOpacity>
          <Ionicon
            name={playVideo ? "pause" : "play"}
            size={51}
            style={{ color: primaryBrandColor }}
            onPress={() => updatePlayVideo(!playVideo)}
          />
        </TouchableOpacity>
        <ThemedButton
          type="ghost"
          trailingIcon={<Icon name="arrow-right" />}
          onPress={seekToNextLine}
        />
        <ThemedButton
          type="ghost"
          trailingIcon={<Icon name="skip-next" />}
          onPress={skipToNextVideo}
        />
        <ThemedButton
          type="ghost"
          trailingIcon={<Icon name="rotate-left" />}
          onPress={rewind}
        />
        {/* <ThemedButton
          type="ghost"
          trailingIcon={<Icon name={ fullscreen ? "fullscreen-exit" : "fullscreen" } />}
          onPress={() => updateFullscreen(!fullscreen)}
        /> */}
      </View>
      <ThemedRBSheet
        ref={refRBSheet}
      >
        <View>
          <ThemedText type="subtitle">{video.title}</ThemedText>
          <ThemedText variant="secondary" style={{ marginTop: 10 }}>
            {`${video.date instanceof Date ? video.date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'No Date' } /  Duration: ${ video.duration ? formatDuration(video.duration) : '--:--'}  / ${video.locale}`}
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

const styles = StyleSheet.create({
  container: {
    flexDirection: "column",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  progressBarContainer: {
    width: "100%",
    height: 10,
    backgroundColor: Swatches.neutral[500], // Light grey background for the progress bar container
    borderRadius: 5,
  },
  progressBar: {
    height: "100%",
    width: "50%", // Example progress: 50%
    borderRadius: 5,
  },
  controls: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    width: "100%",
    marginTop: 10,
  },
});
