import React, { useState } from "react";
import { View, StyleSheet, Dimensions, FlexAlignType } from "react-native";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { LinearGradient } from "expo-linear-gradient";
import { YouTubeVideo } from "@/components/YouTubeVideo";
import { ThemedButton } from "@/components/ThemedButton";
import { ThemedText } from "@/components/ThemedText";
import { useThemeColor } from "@/hooks/useThemeColor";

export const VideoHero: React.FC<{
  youtubeId: string;
  title: string;
  height: number;
}> = ({ youtubeId, title, height }) => {
  const screenWidth = Dimensions.get("window").width;
  const videoWidth = (height * 16) / 9;
  const padding = 26;
  const overlayStyles = {
    width: screenWidth - padding * 2, // 26px padding on each side
    position: "absolute" as "absolute", // Explicitly setting the type to "absolute"
    top: height - 90,
    left: (videoWidth - screenWidth) / 2 + padding, // Note the left edige of the video is off the screen
  };
  // Add a mute state
  const [isMuted, setIsMuted] = useState(true); // Default to muted
  const primaryBackgroundColor = useThemeColor({}, 'primaryBackground');

  return (
    <View style={styles.container}>
      <YouTubeVideo
        youtubeId={youtubeId}
        height={height}
        autoplay={true}
        mute={isMuted}
        controls={false}
      />
      <LinearGradient
        colors={["transparent", primaryBackgroundColor]} // Gradual transparency to a darker shade
        style={{ position: "absolute", width: "100%", height: 100, bottom: 0 }}
      />
      <LinearGradient
        colors={[primaryBackgroundColor, "transparent"]} // Gradual transparency to a darker shade
        style={{ position: "absolute", width: "100%", height: 200, top: 0 }}
      />
      <View style={overlayStyles}>
        <ThemedText style={styles.title} type="defaultBold">{title}</ThemedText>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <ThemedButton
            title="Watch"
            size="medium"
            leadingIcon={<Icon name="play" />}
            style={styles.button}
            onPress={() => {
              console.log("Video playing...");
            }}
          />
          <ThemedButton
            size="medium"
            type="ghost"
            leadingIcon={isMuted ? <Icon name="volume-mute" /> : <Icon name="volume-high" />}
            style={styles.button}
            onPress={() => {
              setIsMuted(!isMuted);
            }}
          />
        </View>
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
  title: {
    marginBottom: 10,
    color: "white",
  },
  button: {
    alignSelf: "flex-start",
  },
});
