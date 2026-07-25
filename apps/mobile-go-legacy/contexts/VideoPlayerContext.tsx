// @/contexts/VideoPlayerContext.tsx

import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { YouTubeVideo } from "@/types/videoTypes";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { useDictionary } from "@/contexts/DictionaryContext";
import { addToWatchHistory } from "@/src/api/directus/user-watch-history";
import { getBestL1Subs, getBestL2Subs, getTokenizerCacheForVideo } from "@/src/api/python/video";
import { getVideosByL2Code } from "@/src/api/directus/youtube-video";
import { useTVShows } from "@/contexts/TVShowsContext";
import { ResizablePanel } from "@/components/ResizablePanel";
import { MiniPlayer } from "@/components/MiniPlayer";
import { useThemeColor } from "@/hooks/useThemeColor";
import { QueueManager } from "@/src/QueueManager";
import { Show } from '@/components/ShowCard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';


type VideoPlayerState = {
  isMini: boolean;
  queueManager: QueueManager;
};

type VideoPlayerContextType = {
  videoPlayerState: VideoPlayerState;
  playNext: () => void;
  playPrevious: () => void;
  closePlayer: () => void;
  minimizePlayer: () => void;
  maximizePlayer: () => void;
  setVideoAndQueue: (video: YouTubeVideo | undefined, queue: YouTubeVideo[], queueType: 'recommended' | 'tvShow' | 'search', metadata?: Show | string) => Promise<void>;
  skipToVideo: (index: number) => void;
  skipToPreviousVideo: () => void;
  skipToNextVideo: () => void;
  currentVideoIndex: number;
  currentVideo: YouTubeVideo | undefined;
  queue: YouTubeVideo[];
  queueType: 'recommended' | 'tvShow' | 'search';
  tvShow: Show | undefined;
  searchTerm: string | undefined;
};

const initialVideoPlayerState: VideoPlayerState = {
  isMini: false,
  queueManager: new QueueManager(),
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
  const { loadEpisodes, shows } = useTVShows();
  const primaryBackgroundColor = useThemeColor({}, "primaryBackground");
  const primaryBrandColor = useThemeColor({}, "primaryBrand");
  const insets = useSafeAreaInsets();

  // Store pending tokenizer cache to load when tokenizer becomes available
  const pendingTokenizerCache = React.useRef<{ [key: string]: any } | null>(null);

  // When tokenizer becomes available, load any pending cache
  useEffect(() => {
    if (tokenizer && pendingTokenizerCache.current) {
      tokenizer.loadCache(pendingTokenizerCache.current);
      pendingTokenizerCache.current = null;
    }
  }, [tokenizer]);

  useEffect(() => {
    const newVideo = videoPlayerState.queueManager.currentVideo;
    if (!newVideo || !newVideo.tv_show) return;
    const currentShow = shows.find(show => newVideo.tv_show && show.id === parseInt(newVideo.tv_show));
    if (currentShow && currentShow.episodes && currentShow.episodes.length > 0) {
      const currentIndex = currentShow.episodes.findIndex(ep => ep.youtube_id === newVideo.youtube_id);
      let reorganizedQueue: YouTubeVideo[];
      
      if (currentIndex !== -1) {
        // If the video is already in the queue, keep it where it is
        reorganizedQueue = [...currentShow.episodes];
      } else {
        // If the video is not in the queue, add it to the beginning
        reorganizedQueue = [newVideo, ...currentShow.episodes];
      }
  
      videoPlayerState.queueManager.setVideoAndQueue(newVideo, reorganizedQueue, 'tvShow', currentShow);
      setVideoPlayerState(prevState => ({ ...prevState }));
    }
  }, [shows, videoPlayerState.queueManager.currentVideo]);

  const closePlayer = useCallback(() => {
    setVideoAndQueue(undefined, [], 'recommended');
  }, []);

  const minimizePlayer = useCallback(() => {
    setVideoPlayerState(prev => ({ ...prev, isMini: true }));
  }, []);

  const maximizePlayer = useCallback(() => {
    setVideoPlayerState(prev => ({ ...prev, isMini: false }));
  }, []);

  const playNext = useCallback(() => {
    videoPlayerState.queueManager.skipToNextVideo();
    setVideoPlayerState(prev => ({ ...prev }));
  }, [videoPlayerState]);

  const playPrevious = useCallback(() => {
    videoPlayerState.queueManager.skipToPreviousVideo();
    setVideoPlayerState(prev => ({ ...prev }));
  }, [videoPlayerState]);

  const setVideoAndQueue = useCallback(async (newVideo: YouTubeVideo | undefined, newQueue: YouTubeVideo[], queueType: 'recommended' | 'tvShow' | 'search', metadata?: Show | string) => {
    videoPlayerState.queueManager.setVideoAndQueue(newVideo, newQueue, queueType, metadata);
    setVideoPlayerState(prevState => ({
      ...prevState,
      isMini: false,
    }));

    if (!newVideo?.youtube_id || !l2Lang || !l1Lang) return;

    // Fetch video details
    try {
      const videos = await getVideosByL2Code(l2Lang, true, {
        filter: { youtube_id: { eq: newVideo.youtube_id } },
      });
      if (videos?.length) {
        const updatedVideo = { ...newVideo, ...videos[0] };
        videoPlayerState.queueManager.setVideoAndQueue(updatedVideo, newQueue, queueType, metadata);
        setVideoPlayerState(prevState => ({ ...prevState }));
        newVideo = updatedVideo;
      }
    } catch (error) {
      console.error("Failed to fetch video details", error);
    }

    // Fetch L2 subtitles if they don't exist
    if (!newVideo.subs_l2?.length) {
      try {
        const l2Subs = await getBestL2Subs(newVideo.youtube_id, l2Lang.code);
        const updatedVideo = { ...newVideo, subs_l2: l2Subs || [] };
        videoPlayerState.queueManager.setVideoAndQueue(updatedVideo, newQueue, queueType, metadata);
        setVideoPlayerState(prevState => ({ ...prevState }));
      } catch (error) {
        console.error("Failed to fetch L2 subs", error);
      }
    }

    // Fetch L1 subtitles if they don't exist
    if (!newVideo.subs_l1?.length) {
      try {
        const l1Subs = await getBestL1Subs(newVideo.youtube_id, l1Lang.code, l2Lang.code);
        const updatedVideo = { ...newVideo, subs_l1: l1Subs || [] };
        videoPlayerState.queueManager.setVideoAndQueue(updatedVideo, newQueue, queueType, metadata);
        setVideoPlayerState(prevState => ({ ...prevState }));
      } catch (error) {
        console.error("Failed to fetch L1 subs", error);
      }
    }

    // Fetch tv show episodes
    if (newVideo.tv_show) {
      try {
        await loadEpisodes(parseInt(newVideo.tv_show));
      } catch (error) {
        console.error("Failed to fetch tv show episodes", error);
      }
    }

    // Fetch and load tokenizer cache
    try {
      const tokenizerCache = await getTokenizerCacheForVideo(newVideo.id || '', l2Lang.code);
      if (tokenizerCache) {
        if (tokenizer) {
          tokenizer.loadCache(tokenizerCache);
        } else {
          // Tokenizer not ready yet — store cache to load when it becomes available
          pendingTokenizerCache.current = tokenizerCache;
        }
      }
    } catch (error) {
      console.error("Failed to fetch and load tokenizer cache", error);
    }

    // Add to watch history
    const authToken = await getStoredAuthToken();
    if (authToken && newVideo.id) {
      try {
        await addToWatchHistory(l2Lang.id, parseInt(newVideo.id), 0, authToken);
      } catch (error) {
        console.error("Failed to add video to watch history", error);
      }
    }
  }, [l1Lang, l2Lang, getStoredAuthToken, tokenizer, loadEpisodes]);

  const skipToVideo = useCallback((index: number) => {
    videoPlayerState.queueManager.skipToVideo(index);
    setVideoPlayerState(prev => ({ ...prev }));
  }, [videoPlayerState]);

  const skipToPreviousVideo = useCallback(() => {
    videoPlayerState.queueManager.skipToPreviousVideo();
    setVideoPlayerState(prev => ({ ...prev }));
  }, [videoPlayerState]);

  const skipToNextVideo = useCallback(() => {
    videoPlayerState.queueManager.skipToNextVideo();
    setVideoPlayerState(prev => ({ ...prev }));
  }, [videoPlayerState]);

  const value: VideoPlayerContextType = {
    videoPlayerState,
    playNext,
    playPrevious,
    closePlayer,
    minimizePlayer,
    maximizePlayer,
    setVideoAndQueue,
    skipToVideo,
    skipToPreviousVideo,
    skipToNextVideo,
    currentVideoIndex: videoPlayerState.queueManager.currentVideoIndex,
    currentVideo: videoPlayerState.queueManager.currentVideo,
    queue: videoPlayerState.queueManager.queue,
    queueType: videoPlayerState.queueManager.queueType,
    tvShow: videoPlayerState.queueManager.tvShow,
    searchTerm: videoPlayerState.queueManager.searchTerm,
  };

  return (
    <VideoPlayerContext.Provider value={value}>
      {children}
      <ResizablePanel
        visible={!!videoPlayerState.queueManager.currentVideo}
        colorFrom={primaryBackgroundColor}
        colorTo={primaryBrandColor}
        minHeight={70}
        minBottom={insets.bottom + 66}
        isMinimized={videoPlayerState.isMini}
        setIsMinimized={(isMini: boolean) => setVideoPlayerState(prev => ({ ...prev, isMini }))}
      >
        <MiniPlayer />
      </ResizablePanel>
    </VideoPlayerContext.Provider>
  );
};