import React from "react";
import { View, StyleSheet, Dimensions } from "react-native";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { LinearGradient } from 'expo-linear-gradient';
import { YouTubePlayer } from "@/components/YouTubePlayer";
import { ThemedButton } from "@/components/ThemedButton";
import { ThemedText } from "@/components/ThemedText";

export const VideoHero = ({ videoId, title, height }) => {
  const screenWidth = Dimensions.get("window").width;
  const videoWidth = (height * 16) / 9;
  const padding = 26;
  const overlayStyles = {
    width: screenWidth - padding * 2, // 26px padding on each side
    position: "absolute",
    top: height - 90,
    left: (videoWidth - screenWidth) / 2 + padding, // Note the left edige of the video is off the screen
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
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,1)']} // Gradual transparency to a darker shade
        style={{ position: 'absolute', width: '100%', height: 100, bottom: 0 }}
      />
      <View style={overlayStyles}>
        <ThemedText style={styles.title}>
          {title}
        </ThemedText>
        <ThemedButton
          title="Watch"
          size="medium"
          leadingIcon={<Icon name="play" />}
          style={styles.button}
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
  title: {
    marginBottom: 10,
    color: 'white',
  },
  button: {
    alignSelf: "left",
    backgroundColor: '#6a32af',  // Consistent theming with the gradient
  },
});

export default VideoHero;
