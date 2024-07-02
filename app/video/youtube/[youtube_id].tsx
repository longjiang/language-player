// @/app/video/youtube/[youtube_id].tsx
import React, { useEffect, useCallback } from "react";
import {
  View,
  Text,
  Dimensions,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useFocusEffect } from "expo-router";
import { useRoute } from "@react-navigation/native";
import { useVideoPlayer } from "@/contexts/VideoPlayerContext";
import { VideoWithTranscript } from "@/components/VideoWithTranscript";
import { VideoWithTranscriptProvider } from "@/contexts/VideoWithTranscriptContext";
import { getVideosByL2Code } from "@/src/api/directus/youtube-video";
import { useLanguage } from "@/contexts/LanguageContext";

const YouTubeVideoScreen = () => {
  const params = useLocalSearchParams();
  const { l2Lang } = useLanguage();
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


  const route = useRoute(); // This hook fetches information about the current route

  // Fetch the video data from the API
  useEffect(() => {
    const fetchVideo = async () => {
      if (!l2Lang) return;
      try {
        const videos = await getVideosByL2Code(l2Lang, true, {
          filter: {
            youtube_id: {
              eq: youtubeIdFromParams,
            },
          },
        });
        if (!videos) return;
        const newVideo = videos[0];
        
        setVideoPlayerState((prev) => ({
          ...prev,
          video: newVideo,
          isMini: false,
        }));
      } catch (error) {
        console.error("Failed to fetch video", error);
      }
    };

    if (videoPlayerState.video && !videoPlayerState.video.subs_l2?.length) { // Skeletal video needs to be fleshed
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
    }, [route])
  );

  if (!videoPlayerState.video) {
    return <Text>Loading...</Text>;
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
