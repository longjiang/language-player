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


  const {
    minimizePlayer,
    maximizePlayer,
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
        
        setVideoPlayerState((prev) => ({
          ...prev,
          video: newVideo,
          isMini: false,
        }));
      } catch (error) {
        console.error("Failed to fetch video", error);
      }
    };

    if (videoPlayerState.video && !videoPlayerState.video.subs_l2) { // Skeletal video needs to be fleshed
      fetchVideo();
    }
  }, [videoPlayerState.video]);

  // Hooks called when the component is focused or unfocused
  useFocusEffect(
    useCallback(() => {
      // When the component is focused

      // Set isMini to false in the context
      if (videoPlayerState.isMini !== false) maximizePlayer(); 
      
      // Set the video in the context to match youtubeId in the param
      if (!youtubeIdFromParams) return;
      if (videoPlayerState?.video?.youtube_id !== youtubeIdFromParams) {
        setVideoPlayerState((prev) => ({
          ...prev,
          video: {
            youtube_id: youtubeIdFromParams,
          },
        }));
      }

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
          initialVideo={ videoPlayerState.video }
          initialPlaylist={ videoPlayerState.queue }
          isMainPlayer={true}
          key={`video-player-${videoPlayerState.video.youtube_id}-${videoPlayerState?.video?.subs_l2?.length}`}

        >
          <VideoWithTranscript
            isMini={false}
            showHeader={true}
          />
        </VideoWithTranscriptProvider>
      </View>
    </GestureHandlerRootView>
  );
};

export default YouTubeVideoScreen;
