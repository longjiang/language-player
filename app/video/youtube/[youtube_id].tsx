// @/app/video/youtube/[youtube_id].tsx
import React, { useEffect, useCallback } from "react";
import {
  View,
  Text,
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
import { useAuth } from "@/contexts/AuthContext";
import { addToWatchHistory } from "@/src/api/directus/user-watch-history";
import { getBestTranslatedSubs } from "@/src/subs";
import { useDictionary } from "@/contexts/DictionaryContext";
import { getTokenizerCacheForVideo } from "@/src/api/python/video";

const YouTubeVideoScreen = () => {
  const params = useLocalSearchParams();
  const { l1Lang, l2Lang, languages } = useLanguage();
  const { getStoredAuthToken } = useAuth();
  const { tokenizer } = useDictionary();
  let youtubeIdFromParams = Array.isArray(params?.youtube_id)
    ? params?.youtube_id[0]
    : params?.youtube_id;
  
  if (!youtubeIdFromParams) return;

  const {
    minimizePlayer,
    maximizePlayer,
    setVideoPlayerState,
    videoPlayerState,
  } = useVideoPlayer();

  const route = useRoute();

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
        if (!newVideo.subs_l1?.length) {
          
          const l1Locales = languages.getLocales(l1Lang);
          const l1Subs = await getBestTranslatedSubs(newVideo.youtube_id, l2Lang.code, l1Locales);
          newVideo.subs_l1 = l1Subs || [];
        }
        
        setVideoPlayerState((prev) => {
          // Find the index of the video in the queue
          const videoIndex = prev.queue.findIndex(v => v.youtube_id === newVideo.youtube_id);
          
          // Create a new queue with the updated video
          const updatedQueue = videoIndex !== -1
            ? prev.queue.map((v, index) => index === videoIndex ? { ...v, ...newVideo } : v)
            : prev.queue;

          return {
            ...prev,
            video: newVideo,
            queue: updatedQueue,
            isMini: false,
          };
        });

        const authToken = await getStoredAuthToken();
        if (authToken) {
          await addToWatchHistory(l2Lang.id, newVideo.id, 0, authToken);
        }
      } catch (error) {
        console.error("Failed to fetch video", error);
      }
    };

    const fetchTokenizerCache = async () => {
      if (!videoPlayerState.video) return
      if (!l2Lang) return;
      if (!tokenizer) return;
      const tokenizerCache = await getTokenizerCacheForVideo(videoPlayerState.video.id, l2Lang.code);
      if (tokenizerCache) {
        tokenizer.loadCache(tokenizerCache);
      }
    }

    fetchTokenizerCache();

    if (videoPlayerState.video && !videoPlayerState.video.subs_l2?.length) {
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

  // console.log(videoPlayerState.video);

  return (
    <GestureHandlerRootView>
      <View>
        <VideoWithTranscriptProvider
          initialVideo={ videoPlayerState.video }
          initialPlaylist={ videoPlayerState.queue }
          isMainPlayer={true}
          key={`video-with-transcript-provider-${videoPlayerState.video.youtube_id}-${videoPlayerState?.video?.subs_l2?.length}`}

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
