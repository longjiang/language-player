// @/app/video/youtube/[youtube_id].tsx
import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  Dimensions,
} from "react-native";
import { router, useNavigation, useLocalSearchParams } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useFocusEffect } from "expo-router";
import { useRoute } from "@react-navigation/native";
import { useVideoPlayer } from "@/contexts/VideoPlayerContext";
import { VideoWithTranscript } from "@/components/VideoWithTranscript";
import { VideoWithTranscriptProvider } from "@/contexts/VideoWithTranscriptContext";
import { parseSubtitles } from "@/src/subs";
import { getCollectionItems } from "@/src/api/directus";
import { normalizeVideoData } from "@/src/directus-video";
import { YouTubeVideo as YouTubeVideoType } from "@/types/videoTypes";

const screenHeight = Dimensions.get("window").height;
const screenWidth = Dimensions.get("window").width;

const YouTubeVideoScreen = () => {
  const params = useLocalSearchParams();
  let youtubeIdFromParams = Array.isArray(params?.youtube_id)
    ? params?.youtube_id[0]
    : params?.youtube_id; // params can sometimes return an array
  
  if (!youtubeIdFromParams) return
  const youtubeVideoFromParams: YouTubeVideoType = { youtube_id: youtubeIdFromParams }

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
              eq: youtubeIdFromParams,
            },
          },
        });
        if (!videos) return;
        const newVideo = normalizeVideoData(videos[0]);
        
        for (let key in newVideo) {
          const videoKey = key as keyof YouTubeVideoType;
          youtubeVideoFromParams[videoKey] = newVideo[videoKey] // Update the video with new data (e.g. subs)
        }
        
        setVideoPlayerState((prev) => ({
          ...prev,
          isMini: false,
          video: newVideo,
        }));
      } catch (error) {
        console.error("Failed to fetch video", error);
      }
    };

    if (youtubeIdFromParams) {
      fetchVideo();
    }
  }, [youtubeIdFromParams]);

  // Hooks called when the component is focused or unfocused
  useFocusEffect(
    useCallback(() => {
      // Log route information when the component is focused
      if (!youtubeIdFromParams) return;
      if (videoPlayerState.youtubeId !== youtubeIdFromParams) setYouTubeId(youtubeIdFromParams); // Set the youtubeId in the context
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
      <View><Text style={{color: 'white'}}>{youtubeVideoFromParams.youtube_id}</Text>
        <VideoWithTranscriptProvider
          initialVideo={ youtubeVideoFromParams }
          initialPlaylist={ videoPlayerState.queue }
        >
          <VideoWithTranscript
            isMini={false}
            showHeader={true}
            key={`video-player-${youtubeIdFromParams}`}
          />
        </VideoWithTranscriptProvider>
      </View>
    </GestureHandlerRootView>
  );
};

export default YouTubeVideoScreen;
