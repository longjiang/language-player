// VideoPlayerContext.js
import React, { createContext, useContext, useState } from 'react';

const VideoPlayerContext = createContext();

export const useVideoPlayer = () => useContext(VideoPlayerContext);

export const VideoPlayerProvider = ({ children }) => {
  const [videoPlayerState, setVideoPlayerState] = useState({
    isVisible: false,
    uri: '',
    isMini: false
  });

  const showVideoPlayer = (uri) => {
    setVideoPlayerState({ isVisible: true, uri, isMini: false });
  };

  const toggleMiniPlayer = () => {
    setVideoPlayerState(prevState => ({
      ...prevState,
      isMini: !prevState.isMini
    }));
  };

  const hideVideoPlayer = () => {
    setVideoPlayerState({ isVisible: false, uri: '', isMini: false });
  };

  return (
    <VideoPlayerContext.Provider value={{ showVideoPlayer, toggleMiniPlayer, hideVideoPlayer, videoPlayerState }}>
      {children}
    </VideoPlayerContext.Provider>
  );
};
