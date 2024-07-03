// @/contexts/VideoWithTranscriptContext/index.tsx

import React, { createContext, useContext, useState, useEffect } from "react";
import { YouTubeVideo, SyncedLine } from "@/types";
import { PLAYER_STATES } from "react-native-youtube-iframe";
import { useSyncedLines } from "./useSyncedLines";
import { usePlaylist } from "./usePlaylist";
import { findSubtitle } from "@/src/subs";
import { VideoWithTranscriptContextType } from "./types";

const VideoWithTranscriptContext = createContext<VideoWithTranscriptContextType | undefined>(undefined);

export const useVideoWithTranscriptContext = () => {
  const context = useContext(VideoWithTranscriptContext);
  if (!context) {
    throw new Error("useVideoWithTranscriptContext must be used within a VideoWithTranscriptProvider");
  }
  return context;
};

export const VideoWithTranscriptProvider: React.FC<{
  initialVideo: YouTubeVideo;
  initialPlaylist: YouTubeVideo[];
  children: React.ReactNode;
  isMainPlayer: boolean;
}> = ({ initialVideo, initialPlaylist, children, isMainPlayer = false }) => {
  initialPlaylist = initialPlaylist || [initialVideo];
  const [playbackState, setPlaybackState] = useState(PLAYER_STATES.UNSTARTED);
  const [currentTime, setCurrentTime] = useState(0);
  const [seekTime, setSeekTime] = useState(0);
  const [playVideo, setPlayVideo] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [duration, setDuration] = useState(0);
  const [startTime, setStartTime] = useState(0);

  const { video, playlist, currentVideoIndex, skipToVideo } = usePlaylist(initialVideo, initialPlaylist);
  const syncedLines = useSyncedLines(video);
  const [currentLine, setCurrentLine] = useState<SyncedLine | null>(null);

  useEffect(() => {
    const subtitle = findSubtitle(currentTime, syncedLines);
    setCurrentLine(subtitle || null);
  }, [currentTime, syncedLines]);

  const updatePlaybackState = (state: PLAYER_STATES) => setPlaybackState(state);
  const updateCurrentTime = (time: number) => setCurrentTime(time);
  const updateFullscreen = (state: boolean) => setFullscreen(state);
  const updateDuration = (duration: number) => setDuration(duration);
  const updateStartTime = (time: number) => setStartTime(time);
  const resetSeekTime = () => setSeekTime(0);
  const seekTo = (time: number) => {
    setSeekTime(time);
    setCurrentTime(time);
  };
  const seekToNextLine = () => {
    const nextLine = syncedLines.find((line) => line.starttime > currentTime);
    if (nextLine) seekTo(nextLine.starttime);
  };
  const seekToPreviousLine = () => {
    const previousLine = syncedLines.slice().reverse().find((line) => line.starttime < currentTime - 0.2);
    if (previousLine) {
      const indexBeforePrevious = syncedLines.findIndex((line) => line.starttime === previousLine.starttime) - 1;
      const previousPreviousLine = syncedLines[Math.max(0, indexBeforePrevious)];
      if (previousPreviousLine) seekTo(previousPreviousLine.starttime);
    }
  };
  const skipToNextVideo = () => {
    if (currentVideoIndex < playlist.length - 1) skipToVideo(currentVideoIndex + 1);
  };
  const skipToPreviousVideo = () => {
    if (currentVideoIndex > 0) skipToVideo(currentVideoIndex - 1);
  };
  const updatePlayVideo = (newVal: boolean) => setPlayVideo(newVal);
  const rewind = () => {
    const previousLine = syncedLines.slice().reverse().find((line) => line.starttime < currentTime);
    if (previousLine) seekTo(previousLine.starttime);
  };

  return (
    <VideoWithTranscriptContext.Provider
      value={{
        video,
        playlist,
        playbackState,
        currentTime,
        currentLine,
        currentVideoIndex,
        seekTime,
        playVideo,
        syncedLines,
        fullscreen,
        duration,
        startTime,
        updateDuration,
        updatePlayVideo,
        updatePlaybackState,
        updateCurrentTime,
        updateFullscreen,
        updateStartTime,
        resetSeekTime,
        seekTo,
        rewind,
        seekToNextLine,
        seekToPreviousLine,
        skipToNextVideo,
        skipToPreviousVideo,
        skipToVideo,
      }}
    >
      {children}
    </VideoWithTranscriptContext.Provider>
  );
};
