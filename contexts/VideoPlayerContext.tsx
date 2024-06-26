import React, { createContext, useContext, useState, ReactNode, Dispatch, SetStateAction } from 'react';
import { YouTubeVideo } from "@/types/videoTypes"

type VideoPlayerState = {
  youtubeId: string;
  isMini: boolean;
  video?: YouTubeVideo;
};

type VideoPlayerContextType = {
  videoPlayerState: VideoPlayerState;
  setVideoPlayerState: Dispatch<SetStateAction<VideoPlayerState>>;
  closePlayer: () => void; // Assuming closePlayer is a function with no parameters and no return value
  video: YouTubeVideo | null;
};

const initialVideoPlayerState: VideoPlayerState = {
  youtubeId: '',
  isMini: false,
  video: undefined,
};

const VideoPlayerContext = createContext<VideoPlayerContextType>({
  videoPlayerState: initialVideoPlayerState,
  setVideoPlayerState: () => {}, // Initial stub
  video: null,
});

export const useVideoPlayer = () => useContext(VideoPlayerContext);

export const VideoPlayerProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [videoPlayerState, setVideoPlayerState] = useState(initialVideoPlayerState);

  // Helper functions to modify state
  const openPlayer = (youtubeId: string) => setVideoPlayerState({ youtubeId, isMini: false });
  const closePlayer = () => setVideoPlayerState({ youtubeId: '', isMini: false });
  const setYouTubeId = (youtubeId: string) => setVideoPlayerState(prev => ({ ...prev, youtubeId }));
  const minimizePlayer = () => setVideoPlayerState(prev => ({ ...prev, isMini: true }));
  const maximizePlayer = () => setVideoPlayerState(prev => ({ ...prev, isMini: false }));

  const value = {
    videoPlayerState,
    setVideoPlayerState,
    openPlayer,
    closePlayer,
    setYouTubeId,
    minimizePlayer,
    maximizePlayer,
  };

  return (
    <VideoPlayerContext.Provider value={value}>
      {children}
    </VideoPlayerContext.Provider>
  );
};