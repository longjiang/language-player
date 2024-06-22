// @/app/select-l2.tsx
import React from "react";
import { View, StyleSheet } from "react-native";
import { ThemedButton } from "@/components/ThemedButton";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { VideoHero } from "@/components/VideoHero";
import {YouTubeVideoCard} from '@/components/YouTubeVideoCard';
import videoData from '@/data/recommended-videos.json'; // Importing the JSON data

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
      </View>
      <View style={styles.container}>
        <ThemedButton
          title="TV Shows"
          size="medium"
          type="neutral"
          leadingIcon={<Icon name="youtube-tv" />}
          trailingIcon={<Icon name="chevron-right" />}
          style={{ justifyContent: "space-between", marginBottom: 26 }}
          onPress={() => {
            // Go to TV shows.
          }}
        />


        { videoData.map((video, index) => (
          <YouTubeVideoCard key={index} video={video} style={{marginBottom: 16 }} />
        )) }
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 26
  },
});

export default MediaHomeScreen;
