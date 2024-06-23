// @/app/video/youtube/[youtube_id].tsx
import React, { useState, useEffect, useCallback } from "react";
import { View, Text, SafeAreaView, Dimensions, BackHandler } from "react-native";
import { ThemedButton } from "@/components/ThemedButton";
import { ThemedText } from "@/components/ThemedText";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { router, useNavigation, useLocalSearchParams } from "expo-router";
import { YouTubeVideo } from "@/components/YouTubeVideo";
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { useFocusEffect } from 'expo-router';
import { useRoute } from '@react-navigation/native';
import { useVideoPlayer } from "@/contexts/VideoPlayerContext";
import { VideoWithTranscript } from "@/components/VideoWithTranscript";
import { VideoWithTranscriptProvider } from "@/contexts/VideoWithTranscriptContext";
import video from "@/data/video.json";

const screenHeight = Dimensions.get('window').height;
const screenWidth = Dimensions.get('window').width;

const YouTubeVideoScreen = () => {
  const params = useLocalSearchParams();
  const youtubeId = params?.youtube_id;

  const { openPlayer, closePlayer, minimizePlayer, maximizePlayer, setYouTubeId, videoPlayerState } = useVideoPlayer();
  


  const navigation = useNavigation();
  const route = useRoute();  // This hook fetches information about the current route


  const position = useSharedValue({ x: 0, y: 0 });
  const size = useSharedValue({ width: screenWidth, height: screenHeight });


  // Hooks called when the component is focused or unfocused
  useFocusEffect(
    useCallback(() => {
      // Log route information when the component is focused
      console.log(`Hello, I am focused! Current route is: ${route.name}`);
      if (videoPlayerState.youtubeId !== youtubeId) setYouTubeId(youtubeId); // Set the youtubeId in the context
      if (videoPlayerState.isMini !== false) maximizePlayer(); // Set isMini to false in the context


      return () => {
        // This code runs when the component loses focus
        console.log(`This route '${route.name}' is now unfocused.`);
        if (route.name === 'video/youtube/[youtube_id]') {
          minimizePlayer();
        }
      };
    }, [route])  // Include `route` in the dependency array if you need to react to changes in the route
  );



  return (
    <View>
      <VideoWithTranscriptProvider initialVideo={video}>
        <VideoWithTranscript video={video} isMini={false} key={`video-player-${video.youtube_id}`} />
      </VideoWithTranscriptProvider>
    </View>
  );
};

export default YouTubeVideoScreen;
