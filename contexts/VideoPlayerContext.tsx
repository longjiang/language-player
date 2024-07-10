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

type VideoPlayerState = {
  isMini: boolean;
};

type VideoPlayerContextType = {
  videoPlayerState: VideoPlayerState;
  playNext: () => void;
  playPrevious: () => void;
  closePlayer: () => void;
  minimizePlayer: () => void;
  maximizePlayer: () => void;
  setVideoAndQueue: (video: YouTubeVideo | undefined, queue: YouTubeVideo[]) => Promise<void>;
  skipToVideo: (index: number) => void;
  skipToNextVideo: () => void;
  skipToPreviousVideo: () => void;
  currentVideoIndex: number;
  currentVideo: YouTubeVideo | undefined;
  queue: YouTubeVideo[];
};

const initialVideoPlayerState: VideoPlayerState = {
  isMini: false,
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
  const [queueManager] = useState(() => new QueueManager());
  const { l1Lang, l2Lang } = useLanguage();
  const { getStoredAuthToken } = useAuth();
  const { tokenizer } = useDictionary();
  const { loadEpisodes, shows } = useTVShows();
  const primaryBackgroundColor = useThemeColor({}, "primaryBackground");
  const primaryBrandColor = useThemeColor({}, "primaryBrand");

  useEffect(() => {
    const newVideo = queueManager.currentVideo;
    if (!newVideo || !newVideo.tv_show) return;
    const currentShow = shows.find(show => show.id === newVideo.tv_show);
    if (currentShow && currentShow.episodes.length > 0) {
      queueManager.reorderQueueForTVShow(newVideo, currentShow.episodes);
    }
  }, [shows, queueManager.currentVideo]);

  const closePlayer = useCallback(() => {
    queueManager.setQueue([], undefined);
    setVideoPlayerState(prev => ({ ...prev, isMini: false }));
  }, [queueManager]);

  const minimizePlayer = useCallback(() => {
    setVideoPlayerState(prev => ({ ...prev, isMini: true }));
  }, []);

  const maximizePlayer = useCallback(() => {
    setVideoPlayerState(prev => ({ ...prev, isMini: false }));
  }, []);

  const playNext = useCallback(() => {
    const nextVideo = queueManager.skipToNextVideo();
    if (nextVideo) {
      setVideoAndQueue(nextVideo, queueManager.queue);
    }
  }, [queueManager]);

  const playPrevious = useCallback(() => {
    const prevVideo = queueManager.skipToPreviousVideo();
    if (prevVideo) {
      setVideoAndQueue(prevVideo, queueManager.queue);
    }
  }, [queueManager]);

  const setVideoAndQueue = useCallback(async (newVideo: YouTubeVideo | undefined, newQueue: YouTubeVideo[]) => {
    queueManager.setQueue(newQueue, newVideo);
    setVideoPlayerState(prev => ({ ...prev, isMini: false }));

    if (!newVideo?.youtube_id || !l2Lang || !l1Lang) return;

    // Fetch video details
    try {
      const videos = await getVideosByL2Code(l2Lang, true, {
        filter: { youtube_id: { eq: newVideo.youtube_id } },
      });
      if (videos?.length) {
        const updatedVideo = { ...newVideo, ...videos[0] };
        queueManager.updateCurrentVideo(updatedVideo);
        newVideo = updatedVideo;
      }
    } catch (error) {
      console.error("Failed to fetch video details", error);
    }

    // Fetch L2 subtitles if they don't exist
    if (!newVideo.subs_l2?.length) {
      try {
        const l2Subs = await getBestL2Subs(newVideo.youtube_id, l2Lang.code);
        queueManager.updateCurrentVideo({ ...newVideo, subs_l2: l2Subs || [] });
      } catch (error) {
        console.error("Failed to fetch L2 subs", error);
      }
    }

    // Fetch L1 subtitles if they don't exist
    if (!newVideo.subs_l1?.length) {
      try {
        const l1Subs = await getBestL1Subs(newVideo.youtube_id, l1Lang.code, l2Lang.code);
        queueManager.updateCurrentVideo({ ...newVideo, subs_l1: l1Subs || [] });
      } catch (error) {
        console.error("Failed to fetch L1 subs", error);
      }
    }

    // Fetch tv show episodes
    if (newVideo.tv_show) {
      try {
        await loadEpisodes(newVideo.tv_show);
      } catch (error) {
        console.error("Failed to fetch tv show episodes", error);
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
  }, [l1Lang, l2Lang, getStoredAuthToken, tokenizer, loadEpisodes, queueManager]);

  const value = {
    videoPlayerState,
    playNext,
    playPrevious,
    closePlayer,
    minimizePlayer,
    maximizePlayer,
    setVideoAndQueue,
    skipToVideo: queueManager.skipToVideo.bind(queueManager),
    skipToNextVideo: queueManager.skipToNextVideo.bind(queueManager),
    skipToPreviousVideo: queueManager.skipToPreviousVideo.bind(queueManager),
    currentVideoIndex: queueManager.currentVideoIndex,
    currentVideo: queueManager.currentVideo,
    queue: queueManager.queue,
  };

  return (
    <VideoPlayerContext.Provider value={value}>
      {children}
      <ResizablePanel
        visible={!!queueManager.currentVideo}
        onMinimize={minimizePlayer}
        onMaximize={maximizePlayer}
        colorFrom={primaryBackgroundColor}
        colorTo={primaryBrandColor}
        isMinimized={videoPlayerState.isMini}
        setIsMinimized={(isMini) => setVideoPlayerState(prev => ({ ...prev, isMini }))}
      >
        <MiniPlayer />
      </ResizablePanel>
    </VideoPlayerContext.Provider>
  );
};