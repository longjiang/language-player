import React, { useEffect } from "react";
import { View, StyleSheet } from "react-native";
import { useVideoPlayer } from "@/contexts/VideoPlayerContext";
import { VideoWithTranscript } from "@/components/VideoWithTranscript";
import { useThemeColor } from "@/hooks/useThemeColor";
import { VideoWithTranscriptProvider } from "@/contexts/VideoWithTranscriptContext";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { addToWatchHistory } from "@/src/api/directus/user-watch-history";
import { getBestL1Subs, getBestL2Subs } from "@/src/api/python/video";
import { useDictionary } from "@/contexts/DictionaryContext";
import { getTokenizerCacheForVideo } from "@/src/api/python/video";
import { getVideosByL2Code } from "@/src/api/directus/youtube-video";

export const MiniPlayer = () => {
  const primaryBackgroundColor = useThemeColor({}, "primaryBackground");
  const primaryBrandColor = useThemeColor({}, "primaryBrand");

  const { videoPlayerState, setVideoAndQueue } = useVideoPlayer();
  const { l1Lang, l2Lang } = useLanguage();
  const { getStoredAuthToken } = useAuth();
  const { tokenizer } = useDictionary();

  useEffect(() => {
    const fetchVideoDetails = async () => {
      if (!videoPlayerState.video?.youtube_id || !l2Lang || !l1Lang) return;

      try {
        // Fetch video details
        const videos = await getVideosByL2Code(l2Lang, true, {
          filter: {
            youtube_id: {
              eq: videoPlayerState.video.youtube_id,
            },
          },
        });
        let updatedVideo = videos?.length ? videos[0] : { ...videoPlayerState.video };

        // Fetch L2 subtitles if they don't exist
        if (!updatedVideo.subs_l2?.length) {
          try {
            const l2Subs = await getBestL2Subs(updatedVideo.youtube_id, l2Lang.code);
            updatedVideo.subs_l2 = l2Subs || [];
          } catch (error) {
            console.error("Failed to fetch L2 subs", error);
          }
        }

        // Fetch L1 subtitles if they don't exist
        if (!updatedVideo.subs_l1?.length) {
          try {
            const l1Subs = await getBestL1Subs(updatedVideo.youtube_id, l1Lang.code, l2Lang.code);
            updatedVideo.subs_l1 = l1Subs || [];
          } catch (error) {
            console.error("Failed to fetch L1 subs", error);
          }
        }

        // If the video has a tv_show id, load the show episodes
        let updatedQueue = [...videoPlayerState.queue];
        if (updatedVideo.tv_show) {
          const showEpisodes = await getVideosByL2Code(l2Lang, false, {
            filter: {
              tv_show: {
                eq: updatedVideo.tv_show,
              },
            },
            sort: ['title'],
          });

          // Find the index of the current video in the show episodes
          const currentIndex = showEpisodes.findIndex(ep => ep.youtube_id === updatedVideo.youtube_id);
          
          // Queue up the next episodes
          if (currentIndex !== -1 && currentIndex < showEpisodes.length - 1) {
            updatedQueue = Array.from(new Set(showEpisodes.slice(currentIndex + 1)));
          }
        }

        // Update video player state
        setVideoAndQueue(updatedVideo, updatedQueue);

        // Add to watch history
        if (updatedVideo.id) {
          const authToken = await getStoredAuthToken();
          if (authToken) {
            await addToWatchHistory(l2Lang.id, Number(updatedVideo.id), 0, authToken);
          }
        }
        // Fetch and load tokenizer cache
        try {
          const tokenizerCache = await getTokenizerCacheForVideo(updatedVideo.id, l2Lang.code);
          if (tokenizerCache && tokenizer) {
            tokenizer.loadCache(tokenizerCache);
          }
        } catch (error) {
          console.error("Failed to fetch and load tokenizer cache", error);
        }
      } catch (error) {
        console.error("Failed to fetch video details", error);
      }
    };

    fetchVideoDetails();
  }, [videoPlayerState.video?.youtube_id, l1Lang, l2Lang]);

  if (!videoPlayerState.video) {
    return null;
  }

  return (
    <GestureHandlerRootView 
      style={{
        ...(videoPlayerState.isMini ? styles.safeAreaMini : styles.safeAreaFull), 
        backgroundColor: videoPlayerState.isMini ? primaryBrandColor : primaryBackgroundColor 
      }}
    >
      <View>
        <VideoWithTranscriptProvider
          initialVideo={videoPlayerState.video}
          initialPlaylist={videoPlayerState.queue}
          isMainPlayer={true}
          key={`video-with-transcript-provider-${videoPlayerState.video.youtube_id}-${videoPlayerState?.video?.subs_l2?.length}`}
        >
          <VideoWithTranscript
            isMini={videoPlayerState.isMini}
            showHeader={!videoPlayerState.isMini}
          />
        </VideoWithTranscriptProvider>
      </View>
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  safeAreaMini: {
    position: "absolute",
    bottom: 100,
    width: "100%"
  },
  safeAreaFull: {
    width: "100%",
    height: "100%",
    position: "absolute",
  },
});