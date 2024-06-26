// @/app/video/youtube/[youtube_id].tsx
import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  SafeAreaView,
  Dimensions,
  BackHandler,
} from "react-native";
import { ThemedButton } from "@/components/ThemedButton";
import { ThemedText } from "@/components/ThemedText";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { router, useNavigation, useLocalSearchParams } from "expo-router";
import { YouTubeVideo } from "@/components/YouTubeVideo";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useFocusEffect } from "expo-router";
import { useRoute } from "@react-navigation/native";
import { useVideoPlayer } from "@/contexts/VideoPlayerContext";
import { VideoWithTranscript } from "@/components/VideoWithTranscript";
import { VideoWithTranscriptProvider } from "@/contexts/VideoWithTranscriptContext";
import { parseSubtitles } from "@/src/subs";
import { getCollectionItems } from "@/src/api/directus";
import { normalizeVideoData } from "@/src/directus-video";

const screenHeight = Dimensions.get("window").height;
const screenWidth = Dimensions.get("window").width;

const YouTubeVideoScreen = () => {
  const params = useLocalSearchParams();
  let youtubeId = Array.isArray(params?.youtube_id)
    ? params?.youtube_id[0]
    : params?.youtube_id; // params can sometimes return an array

  const {
    minimizePlayer,
    maximizePlayer,
    setYouTubeId,
    setVideoPlayerState,
    videoPlayerState,
  } = useVideoPlayer();

  const navigation = useNavigation();
  const route = useRoute(); // This hook fetches information about the current route

  // Fetch the video data from the API
  useEffect(() => {
    const fetchVideo = async () => {
      try {
        const videos = await getCollectionItems("youtube_videos_4", {
          filter: {
            youtube_id: {
              eq: youtubeId,
            },
          },
        });
        if (!videos) return;
        const newVideo = normalizeVideoData(videos[0]);
        setVideoPlayerState((prev) => ({
          ...prev,
          isMini: false,
          video: newVideo,
        }));
      } catch (error) {
        console.error("Failed to fetch video", error);
      }
    };

    if (youtubeId) {
      fetchVideo();
    }
  }, [youtubeId]);

  const position = useSharedValue({ x: 0, y: 0 });
  const size = useSharedValue({ width: screenWidth, height: screenHeight });

  // Hooks called when the component is focused or unfocused
  useFocusEffect(
    useCallback(() => {
      // Log route information when the component is focused
      if (!youtubeId) return;
      if (videoPlayerState.youtubeId !== youtubeId) setYouTubeId(youtubeId); // Set the youtubeId in the context
      if (videoPlayerState.isMini !== false) maximizePlayer(); // Set isMini to false in the context

      return () => {
        // This code runs when the component loses focus
        if (route.name === "video/youtube/[youtube_id]") {
          minimizePlayer();
        }
      };
    }, [route]) // Include `route` in the dependency array if you need to react to changes in the route
  );

  if (!videoPlayerState.video) {
    return <Text>Loading...</Text>; // This will display a loading message until the video is fetched
  }

  return (
    <GestureHandlerRootView>
      <View>
        <VideoWithTranscriptProvider
          initialVideo={videoPlayerState.video}
          initialPlaylist={[videoPlayerState.video]}
        >
          <VideoWithTranscript
            isMini={false}
            showHeader={true}
            key={`video-player-${videoPlayerState.video?.youtube_id}`}
          />
        </VideoWithTranscriptProvider>
      </View>
    </GestureHandlerRootView>
  );
};

export default YouTubeVideoScreen;
