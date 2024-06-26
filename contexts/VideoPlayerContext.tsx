import React, { createContext, useContext, useState, ReactNode, Dispatch, SetStateAction } from 'react';
import { YouTubeVideo } from "@/types/videoTypes"

type VideoPlayerState = {
  youtubeId?: string;
  isMini: boolean;
  video?: YouTubeVideo;
  queue: YouTubeVideo[];
};

type VideoPlayerContextType = {
  videoPlayerState: VideoPlayerState;
  setVideoPlayerState: Dispatch<SetStateAction<VideoPlayerState>>;
  setYouTubeId: (youtubeId: string) => void;
  openPlayerWithQueue: (video: YouTubeVideo, queue: YouTubeVideo[]) => void;
  playNext: () => void;
  playPrevious: () => void;
  closePlayer: () => void;
  minimizePlayer: () => void;
  maximizePlayer:  () => void;
};

const initialVideoPlayerState: VideoPlayerState = {
  youtubeId: '',
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
  setYouTubeId: function (youtubeId: string): void {
    throw new Error('Function not implemented.');
  },
  openPlayerWithQueue: function (video: YouTubeVideo, queue: YouTubeVideo[]): void {
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
  const openPlayer = (youtubeId: string) => setVideoPlayerState({ youtubeId, isMini: false, video: { youtube_id: youtubeId }, queue: []});
  const closePlayer = () => setVideoPlayerState({ youtubeId: '', isMini: false, video: undefined, queue: [] });
  const setYouTubeId = (youtubeId: string) => setVideoPlayerState(prev => ({ ...prev, youtubeId }));
  const minimizePlayer = () => setVideoPlayerState(prev => ({ ...prev, isMini: true }));
  const maximizePlayer = () => setVideoPlayerState(prev => ({ ...prev, isMini: false }));

  const openPlayerWithQueue = (video: YouTubeVideo, queue: YouTubeVideo[]) => {
    setVideoPlayerState({ ...initialVideoPlayerState, youtubeId: video.youtube_id, video, queue });
  };

  const playNext = () => {
    const currentIndex = videoPlayerState.queue.findIndex(v => v.youtube_id === videoPlayerState.youtubeId);
    const nextIndex = currentIndex + 1;
    if (nextIndex < videoPlayerState.queue.length) {
      const nextVideo = videoPlayerState.queue[nextIndex];
      setVideoPlayerState({ ...videoPlayerState, youtubeId: nextVideo.youtube_id, video: nextVideo });
    }
  };

  const playPrevious = () => {
    const currentIndex = videoPlayerState.queue.findIndex(v => v.youtube_id === videoPlayerState.youtubeId);
    const prevIndex = currentIndex - 1;
    if (prevIndex >= 0) {
      const previousVideo = videoPlayerState.queue[prevIndex];
      setVideoPlayerState({ ...videoPlayerState, youtubeId: previousVideo.youtube_id, video: previousVideo });
    }
  };


  const value = {
    videoPlayerState,
    setVideoPlayerState,
    setYouTubeId,
    openPlayerWithQueue,
    playNext,
    playPrevious,
    closePlayer,
    minimizePlayer,
    maximizePlayer,
  };

  console.log('vp Context: videoPlayerState.queue=', videoPlayerState.queue.length)

  return (
    <VideoPlayerContext.Provider value={value}>
      {children}
    </VideoPlayerContext.Provider>
  );
};