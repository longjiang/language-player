// @/contexts/VideoPlayerContext.tsx

import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { YouTubeVideo } from "@/types/videoTypes";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { useDictionary } from "@/contexts/DictionaryContext";
import { addToWatchHistory } from "@/src/api/directus/user-watch-history";
import { getBestL1Subs, getBestL2Subs, getTokenizerCacheForVideo } from "@/src/api/python/video";
import { getVideosByL2Code } from "@/src/api/directus/youtube-video";

type VideoPlayerState = {
  isMini: boolean;
  video?: YouTubeVideo;
  queue: YouTubeVideo[];
};

type VideoPlayerContextType = {
  videoPlayerState: VideoPlayerState;
  playNext: () => void;
  playPrevious: () => void;
  closePlayer: () => void;
  minimizePlayer: () => void;
  maximizePlayer: () => void;
  setVideoAndQueue: (video: YouTubeVideo, queue: YouTubeVideo[]) => void;
};

const initialVideoPlayerState: VideoPlayerState = {
  isMini: false,
  video: undefined,
  queue: [],
};

const VideoPlayerContext = createContext<VideoPlayerContextType | undefined>(undefined);

export const useVideoPlayer = () => {
  const context = useContext(VideoPlayerContext);
  if (context === undefined) {
    throw new Error('useVideoPlayer must be used within a VideoPlayerProvider');
  }
  return context;
};

export const VideoPlayerProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [videoPlayerState, setVideoPlayerState] = useState(initialVideoPlayerState);
  const { l1Lang, l2Lang } = useLanguage();
  const { getStoredAuthToken } = useAuth();
  const { tokenizer } = useDictionary();

  const closePlayer = () => setVideoPlayerState({ isMini: false, video: undefined, queue: [] });
  const minimizePlayer = () => setVideoPlayerState(prev => ({ ...prev, isMini: true }));
  const maximizePlayer = () => setVideoPlayerState(prev => ({ ...prev, isMini: false }));

  const playNext = () => {
    const currentIndex = videoPlayerState.queue.findIndex(v => v.youtube_id === videoPlayerState.video?.youtube_id);
    const nextIndex = currentIndex + 1;
    if (nextIndex < videoPlayerState.queue.length) {
      const nextVideo = videoPlayerState.queue[nextIndex];
      setVideoPlayerState(prev => ({ ...prev, video: nextVideo }));
    }
  };

  const playPrevious = () => {
    const currentIndex = videoPlayerState.queue.findIndex(v => v.youtube_id === videoPlayerState.video?.youtube_id);
    const prevIndex = currentIndex - 1;
    if (prevIndex >= 0) {
      const previousVideo = videoPlayerState.queue[prevIndex];
      setVideoPlayerState(prev => ({ ...prev, video: previousVideo }));
    }
  };

  const setVideoAndQueue = (video: YouTubeVideo, queue: YouTubeVideo[]) => {
    setVideoPlayerState(state => ({
      ...state,
      isMini: false,
      video: video,
      queue: queue
    }));
  };

  const fetchVideoDetails = async (youtubeId: string) => {
    if (!youtubeId || !l2Lang || !l1Lang) return;

    try {
      // Fetch video details
      const videos = await getVideosByL2Code(l2Lang, true, {
        filter: {
          youtube_id: {
            eq: youtubeId,
          },
        },
      });
      let updatedVideo = videos?.length ? videos[0] : { ...videoPlayerState.video, youtube_id: youtubeId };

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

  // New useEffect hook to fetch video details when the video changes
  useEffect(() => {
    if (videoPlayerState.video?.youtube_id) {
      fetchVideoDetails(videoPlayerState.video.youtube_id);
    }
  }, [videoPlayerState.video?.youtube_id, l1Lang, l2Lang]);

  const value = {
    videoPlayerState,
    playNext,
    playPrevious,
    closePlayer,
    minimizePlayer,
    maximizePlayer,
    setVideoAndQueue,
  };

  return (
    <VideoPlayerContext.Provider value={value}>
      {children}
    </VideoPlayerContext.Provider>
  );
};