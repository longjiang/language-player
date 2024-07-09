// @/contexts/VideoPlayerContext.tsx

import React, { createContext, useContext, useState, ReactNode } from 'react';
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

  const closePlayer = () => setVideoPlayerState({ isMini: false, video: undefined, queue: [] });
  const minimizePlayer = () => setVideoPlayerState(prev => ({ ...prev, isMini: true }));
  const maximizePlayer = () => setVideoPlayerState(prev => ({ ...prev, isMini: false }));

  const playNext = () => {
    const currentIndex = videoPlayerState.queue.findIndex(v => v.youtube_id === videoPlayerState.video?.youtube_id);
    const nextIndex = currentIndex + 1;
    if (nextIndex < videoPlayerState.queue.length) {
      const nextVideo = videoPlayerState.queue[nextIndex];
      setVideoAndQueue(nextVideo, videoPlayerState.queue);
    }
  };

  const playPrevious = () => {
    const currentIndex = videoPlayerState.queue.findIndex(v => v.youtube_id === videoPlayerState.video?.youtube_id);
    const prevIndex = currentIndex - 1;
    if (prevIndex >= 0) {
      const previousVideo = videoPlayerState.queue[prevIndex];
      setVideoAndQueue(previousVideo, videoPlayerState.queue);
    }
  };

  const fetchVideoDetails = async (video: YouTubeVideo): Promise<YouTubeVideo> => {
    if (!video.youtube_id || !l2Lang || !l1Lang) return video;

    try {
      // Fetch video details
      const videos = await getVideosByL2Code(l2Lang, true, {
        filter: {
          youtube_id: {
            eq: video.youtube_id,
          },
        },
      });
      let updatedVideo = videos?.length ? videos[0] : { ...video };

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

      return updatedVideo;
    } catch (error) {
      console.error("Failed to fetch video details", error);
      return video;
    }
  };

  const setVideoAndQueue = async (newVideo: YouTubeVideo, newQueue: YouTubeVideo[]) => {
    setVideoPlayerState(prevState => {
      // If the new video has the same youtube_id as the existing video, do nothing
      if (newVideo.youtube_id === prevState.video?.youtube_id) {
        return prevState;
      }

      // Fetch video details if the youtube_id is different
      fetchVideoDetails(newVideo).then(updatedVideo => {
        // Update the queue, replacing the current video if it exists
        const updatedQueue = newQueue.map(queueVideo => 
          queueVideo.youtube_id === updatedVideo.youtube_id ? updatedVideo : queueVideo
        );

        setVideoPlayerState(latestState => ({
          ...latestState,
          video: updatedVideo,
          queue: updatedQueue,
          isMini: false,
        }));
      });

      // Return an intermediate state while we're fetching the details
      return {
        ...prevState,
        video: newVideo,
        queue: newQueue,
        isMini: false,
      };
    });
  };

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