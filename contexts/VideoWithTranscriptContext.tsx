import React, { createContext, useContext, useState, useEffect } from 'react';

// Define the shape of the context
interface VideoWithTranscriptContextType {
  playbackState: string;
  currentTime: number;
}

// Create the context with a default value
const VideoWithTranscriptContext = createContext<VideoWithTranscriptContextType | undefined>(undefined);

export const useVideoWithTranscriptContext = () => {
  const context = useContext(VideoWithTranscriptContext);
  if (!context) {
    throw new Error('useVideoWithTranscriptContext must be used within a YouTubeVideoProvider');
  }
  return context;
};



export const VideoWithTranscriptProvider: React.FC = ({ children }) => {
  const [playbackState, setPlaybackState] = useState('stopped');
  const [currentTime, setCurrentTime] = useState(0);

  // Function to update playbackState
  const updatePlaybackState = (state: string) => {
    setPlaybackState(state);
  };

  // Function to update currentTime directly
  const updateCurrentTime = (time: number) => {
    setCurrentTime(time);
  };

  return (
    <VideoWithTranscriptContext.Provider value={{ playbackState, currentTime, updatePlaybackState, updateCurrentTime }}>
      {children}
    </VideoWithTranscriptContext.Provider>
  );
};