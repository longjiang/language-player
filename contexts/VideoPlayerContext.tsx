// @/contexts/VideoPlayerContext.tsx

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
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
  setVideoAndQueue: (video: YouTubeVideo, queue: YouTubeVideo[]) => Promise<void>;
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

  const closePlayer = useCallback(() => 
    setVideoPlayerState({ isMini: false, video: undefined, queue: [] }),
  []);

  const minimizePlayer = useCallback(() => 
    setVideoPlayerState(prev => ({ ...prev, isMini: true })),
  []);

  const maximizePlayer = useCallback(() => 
    setVideoPlayerState(prev => ({ ...prev, isMini: false })),
  []);

  const playNext = useCallback(() => {
    setVideoPlayerState(prevState => {
      const currentIndex = prevState.queue.findIndex(v => v.youtube_id === prevState.video?.youtube_id);
      const nextIndex = currentIndex + 1;
      if (nextIndex < prevState.queue.length) {
        const nextVideo = prevState.queue[nextIndex];
        setVideoAndQueue(nextVideo, prevState.queue);
      }
      return prevState;
    });
  }, []);

  const playPrevious = useCallback(() => {
    setVideoPlayerState(prevState => {
      const currentIndex = prevState.queue.findIndex(v => v.youtube_id === prevState.video?.youtube_id);
      const prevIndex = currentIndex - 1;
      if (prevIndex >= 0) {
        const previousVideo = prevState.queue[prevIndex];
        setVideoAndQueue(previousVideo, prevState.queue);
      }
      return prevState;
    });
  }, []);

  const updateVideoField = useCallback((field: keyof YouTubeVideo, value: any) => {
    setVideoPlayerState(prevState => ({
      ...prevState,
      video: prevState.video ? { ...prevState.video, [field]: value } : undefined
    }));
  }, []);

  const setVideoAndQueue = useCallback(async (newVideo: YouTubeVideo, newQueue: YouTubeVideo[]) => {
    // Set initial state
    setVideoPlayerState(prevState => ({
      ...prevState,
      video: newVideo,
      queue: newQueue,
      isMini: false,
    }));

    if (!newVideo.youtube_id || !l2Lang || !l1Lang) return;

    // Fetch video details
    try {
      const videos = await getVideosByL2Code(l2Lang, true, {
        filter: { youtube_id: { eq: newVideo.youtube_id } },
      });
      if (videos?.length) {
        updateVideoField('id', videos[0].id);
        // Update other fields as needed
      }
    } catch (error) {
      console.error("Failed to fetch video details", error);
    }

    // Fetch L2 subtitles if they don't exist
    if (!newVideo.subs_l2?.length) {
      try {
        const l2Subs = await getBestL2Subs(newVideo.youtube_id, l2Lang.code);
        updateVideoField('subs_l2', l2Subs || []);
      } catch (error) {
        console.error("Failed to fetch L2 subs", error);
      }
    }

    // Fetch L1 subtitles if they don't exist
    if (!newVideo.subs_l1?.length) {
      try {
        const l1Subs = await getBestL1Subs(newVideo.youtube_id, l1Lang.code, l2Lang.code);
        updateVideoField('subs_l1', l1Subs || []);
      } catch (error) {
        console.error("Failed to fetch L1 subs", error);
      }
    }

    // Fetch and load tokenizer cache
    try {
      const tokenizerCache = await getTokenizerCacheForVideo(newVideo.id, l2Lang.code);
      if (tokenizerCache && tokenizer) {
        tokenizer.loadCache(tokenizerCache);
      }
    } catch (error) {
      console.error("Failed to fetch and load tokenizer cache", error);
    }

    // Add to watch history
    const authToken = await getStoredAuthToken();
    if (authToken && newVideo.id) {
      try {
        await addToWatchHistory(l2Lang.id, Number(newVideo.id), 0, authToken);
      } catch (error) {
        console.error("Failed to add video to watch history", error);
      }
    }
  }, [l1Lang, l2Lang, getStoredAuthToken, tokenizer, updateVideoField]);

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