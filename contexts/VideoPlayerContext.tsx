// @/contexts/VideoPlayerContext.tsx
import React, { createContext, useContext, useState } from 'react';

const VideoPlayerContext = createContext();

export const useVideoPlayer = () => useContext(VideoPlayerContext);

export const VideoPlayerProvider = ({ children }) => {
  const [videoPlayerState, setVideoPlayerState] = useState({
    youtubeId: '',
    isMini: false
  });

  const openPlayer = (youtubeId) => {
    setVideoPlayerState({ youtubeId, isMini: false });
  };

  const closePlayer = () => {
    setVideoPlayerState({ youtubeId: '', isMini: false }); // Setting youtubeId to an empty string closes the player
  };

  const setYouTubeId = (youtubeId) => {
    setVideoPlayerState(prevState => ({
      ...prevState,
      youtubeId
    }));
  };

  const minimizePlayer = () => {
    setVideoPlayerState(prevState => ({
      ...prevState,
      isMini: true
    }));
  };

  const maximizePlayer = () => {
    setVideoPlayerState(prevState => ({
      ...prevState,
      isMini: false
    }));
  };

  return (
    <VideoPlayerContext.Provider value={{ openPlayer, closePlayer, minimizePlayer, maximizePlayer, setYouTubeId, videoPlayerState }}>
      {children}
    </VideoPlayerContext.Provider>
  );
};
