// @/app/select-l2.tsx
import React from "react";
import { View, StyleSheet } from "react-native";
import { ThemedButton } from "@/components/ThemedButton";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { router } from "expo-router";
import { YouTubePlayer } from "@/components/YouTubePlayer";
import { VideoHero } from "@/components/VideoHero";

const MediaHomeScreen = () => {
  const videoHeight = 300;
  const videoWidth = videoHeight * 1.777777777777778;

  return (
    <View>
      <View
        style={{
          width: videoWidth,
          alignSelf: "center",
          height: videoHeight,
          marginTop: -50,
        }}
      >
        <VideoHero
          videoId="t6fPzVNIEB0"
          title="As Long As You Love Me"
          height={videoHeight}
        />
        {/* <YouTubePlayer
          videoId="t6fPzVNIEB0"
          height={videoHeight}
          autoplay={true} // Start playing automatically
          mute={false} // Start with sound on
          controls={false} // Hide the controls
        /> */}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export default MediaHomeScreen;
