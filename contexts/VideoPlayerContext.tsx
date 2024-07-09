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
    console.log("Fetching video details", video.title);

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
      console.log("1. Video details fetched");

      // Fetch L2 subtitles if they don't exist
      if (!updatedVideo.subs_l2?.length) {
        try {
          const l2Subs = await getBestL2Subs(updatedVideo.youtube_id, l2Lang.code);
          updatedVideo.subs_l2 = l2Subs || [];
          console.log("2. L2 subtitles fetched");
        } catch (error) {
          console.error("Failed to fetch L2 subs", error);
        }
      } else {
        console.log("2. L2 subtitles already exist");
      }

      // Fetch L1 subtitles if they don't exist
      if (!updatedVideo.subs_l1?.length) {
        try {
          const l1Subs = await getBestL1Subs(updatedVideo.youtube_id, l1Lang.code, l2Lang.code);
          updatedVideo.subs_l1 = l1Subs || [];
          console.log("3. L1 subtitles fetched");
        } catch (error) {
          console.error("Failed to fetch L1 subs", error);
        }
      } else {
        console.log("3. L1 subtitles already exist");
      }

      // Add to watch history
      if (updatedVideo.id) {
        const authToken = await getStoredAuthToken();
        if (authToken) {
          try {
            console.log("4. Adding to watch history...");
            console.log(`Debug: l2Lang.id=${l2Lang.id}, videoId=${updatedVideo.id}`);
            
            const timeoutPromise = new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Timeout while adding to watch history')), 10000)
            );
            
            const watchHistoryResult = await Promise.race([
              addToWatchHistory(l2Lang.id, Number(updatedVideo.id), 0, authToken),
              timeoutPromise
            ]);
            
            console.log("4. Added to watch history successfully", watchHistoryResult);
          } catch (error) {
            console.error("Failed to add video to watch history", error);
            if (error instanceof Error) {
              console.error("Error message:", error.message);
              console.error("Error stack:", error.stack);
            }
          }
        } else {
          console.log("4. Skipped adding to watch history (no auth token)");
        }
      } else {
        console.log("4. Skipped adding to watch history (no video id)");
      }

      // Fetch and load tokenizer cache
      try {
        console.log("5. Fetching tokenizer cache...");
        const tokenizerCache = await getTokenizerCacheForVideo(updatedVideo.id, l2Lang.code);
        if (tokenizerCache && tokenizer) {
          tokenizer.loadCache(tokenizerCache);
          console.log("5. Tokenizer cache loaded successfully");
        } else {
          console.log("5. No tokenizer cache to load");
        }
      } catch (error) {
        console.error("Failed to fetch and load tokenizer cache", error);
      }

      console.log("Updated video details", updatedVideo);

      return updatedVideo;
    } catch (error) {
      console.error("Failed to fetch video details", error);
      if (error instanceof Error) {
        console.error("Error message:", error.message);
        console.error("Error stack:", error.stack);
      }
      return video;
    }
  };

  const setVideoAndQueue = async (newVideo: YouTubeVideo, newQueue: YouTubeVideo[]) => {
    setVideoPlayerState(prevState => {
      // If the new video has the same youtube_id as the existing video, preserve the existing video data
      if (newVideo.youtube_id === prevState.video?.youtube_id) {
        return {
          ...prevState,
          queue: newQueue.map(queueVideo => 
            queueVideo.youtube_id === prevState.video?.youtube_id ? prevState.video : queueVideo
          ),
        };
      }

      // Fetch video details if the youtube_id is different
      fetchVideoDetails(newVideo).then(updatedVideo => {
        // Update the queue, preserving existing video data for videos already in the queue
        const updatedQueue = newQueue.map(queueVideo => {
          const existingVideo = prevState.queue.find(v => v.youtube_id === queueVideo.youtube_id);
          return existingVideo || queueVideo;
        });

        setVideoPlayerState(latestState => ({
          ...latestState,
          video: updatedVideo,
          queue: updatedQueue,
          isMini: false,
        }));
      }).catch(error => {
        console.error("Error in fetchVideoDetails:", error);
        // Handle the error appropriately, maybe set an error state
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