// @/contexts/VideoWithTranscriptContext.tsx

import React, { createContext, useContext, useState, useEffect } from 'react';
import { YouTubeVideo } from '@/types';

// Define the shape of the context
interface VideoWithTranscriptContextType {
  video: YouTubeVideo;
  playbackState: string;
  currentTime: number;
  seekTime?: number;
  playVideo: boolean;
  resetSeekTime: () => void;
  updatePlaybackState: (state: string) => void;
  updateCurrentTime: (time: number, seekTime?: boolean) => void;
  seekTo: (time: number) => void;
  seekToNextLine: () => void;
  seekToPreviousLine: () => void;
  skipToNextVideo: () => void;
  skipToPreviousVideo: () => void;
  updatePlayVideo: (newVal: boolean) => void;
}

const videoList = []; // To be implemented later
let currentVideoIndex = 0;

// Create the context with a default value
const VideoWithTranscriptContext = createContext<VideoWithTranscriptContextType | undefined>(undefined);

export const useVideoWithTranscriptContext = () => {
  const context = useContext(VideoWithTranscriptContext);
  if (!context) {
    throw new Error('useVideoWithTranscriptContext must be used within a YouTubeVideoProvider');
  }
  return context;
};

export const VideoWithTranscriptProvider: React.FC<{ initialVideo: YouTubeVideo }> = ({ initialVideo, children }) => {
  const [playbackState, setPlaybackState] = useState('stopped');
  const [currentTime, setCurrentTime] = useState(0);
  const [seekTime, setSeekTime] = useState(0); // Watched for seeking
  const [playVideo, setPlayVideo] = useState(false); // Set to true to play, false to pause
  const [video, setVideo] = useState<YouTubeVideo>(initialVideo);

  useEffect(() => {
    // Reset context state when the initialVideo changes
    setVideo(initialVideo);
  }, [initialVideo]);

  const updatePlaybackState = (state: string) => {
    setPlaybackState(state);
  };

  const updateCurrentTime = (time: number) => {
    setCurrentTime(time);
  };

  const resetSeekTime = () => {
    setSeekTime(null);
  };

  const seekTo = (time: number) => {
    setSeekTime(time);
    setCurrentTime(time);
  };

  const seekToNextLine = () => {
    // Logic to seek to the next line in the transcript goes here
  }

  const seekToPreviousLine = () => {
    // Logic to seek to the previous line in the transcript goes here
  }

  const skipToNextVideo = () => {
    if (currentVideoIndex < videoList.length - 1) {
      currentVideoIndex += 1;
      // Simulate loading the next video
      setCurrentTime(0);
      setPlaybackState('stopped');
      // Logic to change the video source goes here
    }
  };

  const skipToPreviousVideo = () => {
    if (currentVideoIndex > 0) {
      currentVideoIndex -= 1;
      // Simulate loading the previous video
      setCurrentTime(0);
      setPlaybackState('stopped');
      // Logic to change the video source goes here
    }
  };

  const updatePlayVideo = (newVal: boolean) => {
    setPlayVideo(newVal);
  }

  return (
    <VideoWithTranscriptContext.Provider value={{
      video,
      playbackState, 
      currentTime, 
      seekTime,
      playVideo,
      resetSeekTime,
      seekToNextLine,
      seekToPreviousLine,
      updatePlaybackState, 
      updateCurrentTime, 
      seekTo, 
      skipToNextVideo, 
      skipToPreviousVideo, 
      updatePlayVideo
    }}>
      {children}
    </VideoWithTranscriptContext.Provider>
  );
};