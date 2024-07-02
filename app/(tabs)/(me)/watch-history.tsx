// @/app/watch-history.tsx
import React, { useState } from "react";
import { ThemedScreen } from "@/components/ThemedScreen";
import { router } from "expo-router";
import { YouTubeVideoList } from "@/components/YouTubeVideoList";
import videoData from '@/data/recommended-videos.json'; // Example data

const WatchHistoryScreen = () => {

  return (
    <ThemedScreen
      title="Watch History"
      onBackPress={() => router.navigate('/(tabs)/(me)')}
    >
      
      <YouTubeVideoList videos={videoData} />
    </ThemedScreen>
  );
};

export default WatchHistoryScreen;
