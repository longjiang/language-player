import React from "react";
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  Dimensions,
} from "react-native";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { YouTubePlayer } from "@/components/YouTubePlayer";
import { ThemedButton } from "@/components/ThemedButton";
import { ThemedText } from "@/components/ThemedText";

export const VideoHero = ({ videoId, title, height }) => {
  const screenWidth = Dimensions.get("window").width;
  const videoWidth = (height * 16) / 9;
  const overlayStyles = {
    width: screenWidth - 26 * 2,
    position: "absolute",
    top: height - 90,
    left: (videoWidth - screenWidth) / 2 + 26,
  };

  return (
    <View style={styles.container}>
      <YouTubePlayer
        videoId={videoId}
        height={height}
        autoplay={true}
        mute={false}
        controls={false}
      />
      <View style={overlayStyles}>
        <ThemedText style={{ marginBottom: 10 }} type="defaultBold">
          {title}
        </ThemedText>
        <ThemedButton
          title="Watch"
          size="medium"
          leadingIcon={<Icon name="play" />}
          style={{ alignSelf: "left" }}
          onPress={() => {
            console.log("Video playing...");
          }}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: "100%",
    alignSelf: "center",
    backgroundColor: "#000",
    position: "relative",
  },
});
