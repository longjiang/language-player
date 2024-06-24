// @/app/select-l2.tsx
import React, { useState } from "react";
import { StyleSheet } from "react-native";
import { ThemedButton } from "@/components/ThemedButton";
import { ThemedScreen } from "@/components/ThemedScreen";
import Icon from "react-native-vector-icons/MaterialIcons";
import { router } from "expo-router";
import { YouTubeVideoList } from "@/components/YouTubeVideoList";
import videoData from '@/data/recommended-videos.json'; // Importing the JSON data

const WatchHistoryScreen = () => {
  const [code, setCode] = useState("");

  const onSelect = (value) => {
    console.log('Selected:', value);
  }

  return (
    <ThemedScreen
      title="Watch History"
      onBackPress={() => router.navigate('/(tabs)/(me)')}
    >
      
      <YouTubeVideoList videos={videoData} />
    </ThemedScreen>
  );
};

const styles = StyleSheet.create({
  item: {
    padding: 16,
  },
  instructions: {
    marginBottom: 20,
  },
  button: {
    marginTop: 20,
    marginBottom: 110,
  },
});

export default WatchHistoryScreen;
