import React, { createContext, useContext, useState, ReactNode, Dispatch, SetStateAction } from 'react';
import { YouTubeVideo } from "@/types/videoTypes"

type VideoPlayerState = {
  isMini: boolean;
  video?: YouTubeVideo;
  queue: YouTubeVideo[];
};

type VideoPlayerContextType = {
  videoPlayerState: VideoPlayerState;
  setVideoPlayerState: Dispatch<SetStateAction<VideoPlayerState>>;
  playNext: () => void;
  playPrevious: () => void;
  closePlayer: () => void;
  minimizePlayer: () => void;
  maximizePlayer:  () => void;
};

const initialVideoPlayerState: VideoPlayerState = {
  isMini: false,
  video: undefined,
  queue: [],
};

const VideoPlayerContext = createContext<VideoPlayerContextType>({
  videoPlayerState: initialVideoPlayerState,
  setVideoPlayerState: function (): void {
    throw new Error('Function not implemented.');
  },
  closePlayer: function (): void {
    throw new Error('Function not implemented.');
  },
  minimizePlayer: function (): void {
    throw new Error('Function not implemented.');
  },
  maximizePlayer: function (): void {
    throw new Error('Function not implemented.');
  },
  playNext: function (): void {
    throw new Error('Function not implemented.');
  },
  playPrevious: function (): void {
    throw new Error('Function not implemented.');
  },
});

export const useVideoPlayer = () => useContext(VideoPlayerContext);

export const VideoPlayerProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [videoPlayerState, setVideoPlayerState] = useState(initialVideoPlayerState);
  // Helper functions to modify state
  const closePlayer = () => setVideoPlayerState({ isMini: false, video: undefined, queue: [] });
  const minimizePlayer = () => {
    setVideoPlayerState(prev => ({ ...prev, isMini: true }))
  };
  const maximizePlayer = () => setVideoPlayerState(prev => ({ ...prev, isMini: false }));

  const playNext = () => {
    const currentIndex = videoPlayerState.queue.findIndex(v => v.youtube_id === videoPlayerState.video.youtube_id);
    const nextIndex = currentIndex + 1;
    if (nextIndex < videoPlayerState.queue.length) {
      const nextVideo = videoPlayerState.queue[nextIndex];
      setVideoPlayerState({ ...videoPlayerState, video: nextVideo });
    }
  };

  const playPrevious = () => {
    const currentIndex = videoPlayerState.queue.findIndex(v => v.youtube_id === videoPlayerState.video.youtube_id);
    const prevIndex = currentIndex - 1;
    if (prevIndex >= 0) {
      const previousVideo = videoPlayerState.queue[prevIndex];
      setVideoPlayerState({ ...videoPlayerState, video: previousVideo });
    }
  };


  const value = {
    videoPlayerState,
    setVideoPlayerState,
    playNext,
    playPrevious,
    closePlayer,
    minimizePlayer,
    maximizePlayer,
  };

  // console.log('vp Context: videoPlayerState.queue=', videoPlayerState.queue.length)

  return (
    <VideoPlayerContext.Provider value={value}>
      {children}
    </VideoPlayerContext.Provider>
  );
};