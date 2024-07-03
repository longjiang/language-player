// @/contexts/VideoWithTranscriptContext/index

import React, { createContext, useContext, useState, useEffect } from "react";
import { YouTubeVideo, Line, SyncedLine } from "@/types";
import { syncLines, findSubtitle } from "@/src/subs";
import { PLAYER_STATES } from "react-native-youtube-iframe";
import { router } from "expo-router";

export interface VideoWithTranscriptContextType {
  video: YouTubeVideo;
  playlist: YouTubeVideo[];
  playbackState: PLAYER_STATES;
  currentTime: number;
  seekTime?: number;
  playVideo: boolean;
  syncedLines: SyncedLine[];
  currentLine: SyncedLine | null;
  currentVideoIndex: number;
  fullscreen: boolean;
  duration: number;
  startTime: number;
  updateDuration: (duration: number) => void;
  updatePlayVideo: (newVal: boolean) => void;
  updatePlaybackState: (state: PLAYER_STATES) => void;
  updateCurrentTime: (time: number, seekTime?: boolean) => void;
  updateFullscreen: (state: boolean) => void;
  updateStartTime: (time: number) => void;
  resetSeekTime: () => void;
  seekTo: (time: number) => void;
  rewind: () => void;
  seekToNextLine: () => void;
  seekToPreviousLine: () => void;
  skipToNextVideo: () => void;
  skipToPreviousVideo: () => void;
  skipToVideo: (index: number) => void;
}

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
  const [video, setVideo] = useState<YouTubeVideo>(initialVideo);
  const [playlist, setPlaylist] = useState<YouTubeVideo[]>(initialPlaylist);
  const [syncedLines, setSyncedLines] = useState<SyncedLine[]>([]);
  const [currentLine, setCurrentLine] = useState<SyncedLine | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [duration, setDuration] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);

  // Logic for managing playlist navigation
  useEffect(() => {
    if (currentVideoIndex < playlist.length) {
      // console.log('vwtContext', currentVideoIndex)
      const newVideo = playlist[currentVideoIndex];
      if (!newVideo) return
      setVideo(newVideo);
      setPlaybackState(PLAYER_STATES.UNSTARTED);
      setCurrentTime(0);
    }
  }, [currentVideoIndex, playlist]);

  useEffect(() => {
    // Find the current index
    const index = playlist.findIndex((video) => video.youtube_id === initialVideo.youtube_id);
    setCurrentVideoIndex(index);
  }, [initialVideo])

  useEffect(() => {
    if (! video?.subs_l2?.length) return;
    const l1Lines = video.subs_l1 || [];
    const l2Lines = video.subs_l2 || [];
    const syncedLines = syncLines(l1Lines, l2Lines);
    setSyncedLines(syncedLines);
  }, [video?.subs_l2]);




  // Handle currentTime changes
  useEffect(() => {
    // console.log("ST ", currentTime);
    const subtitle = findSubtitle(currentTime, syncedLines);

    if (subtitle) {
      setCurrentLine(subtitle);
    } else {
      setCurrentLine(null);
    }
  }, [currentTime]);

  const updatePlaybackState = (state: PLAYER_STATES) => {
    setPlaybackState(state);
  };

  const updateCurrentTime = (time: number) => {
    setCurrentTime(time);
  };

  const updateFullscreen = (state: boolean) => {
    setFullscreen(state);
  }

  const updateDuration = (duration: number) => {
    setDuration(duration);
  }

  const updateStartTime = (time: number) => {
    setStartTime(time);
  }

  const resetSeekTime = () => {
    setSeekTime(0);
  };

  const seekTo = (time: number) => {
    setSeekTime(time);
    setCurrentTime(time);
  };

  const seekToNextLine = () => {
    // Find the start time of the next line
    const nextLine = syncedLines.find((line) => line.starttime > currentTime);
    if (nextLine) {
      seekTo(nextLine.starttime);
    }
  };

  const seekToPreviousLine = () => {
    // Find the start time of the previous line
    const previousLine = syncedLines
      .slice()
      .reverse()
      .find((line) => line.starttime < currentTime - 0.2);
    // We go to the line before the previous line so that we don't keep seeking to the same line
    if (!previousLine) return;
    const indexBeforePrevious = syncedLines.findIndex((line) => line.starttime === previousLine.starttime) - 1;
    const previousPreviousLine = syncedLines[Math.max(0, indexBeforePrevious)];
    if (previousPreviousLine) {
      seekTo(previousPreviousLine.starttime);
    }
  };

  const skipToNextVideo = () => {
    if (currentVideoIndex < playlist.length - 1) {
      skipToVideo(currentVideoIndex + 1);
    }
  };

  const skipToPreviousVideo = () => {
    if (currentVideoIndex > 0) {
      skipToVideo(currentVideoIndex - 1);
    }
  };

  const skipToVideo = (index: number) => {
    if (index >= 0 && index < playlist.length) {
      const nextVideo = playlist[index]
      if (isMainPlayer) {
        router.navigate('/video/youtube/' + nextVideo.youtube_id)
        return;
      }
      setCurrentVideoIndex(index);
      setCurrentTime(0);
      setVideo(playlist[index]);
    }
  }

  const updatePlayVideo = (newVal: boolean) => {
    setPlayVideo(newVal);
  };

  const rewind = () => {
    // Find the start time of the previous line
    const previousLine = syncedLines
      .slice()
      .reverse()
      .find((line) => line.starttime < currentTime);
    if (previousLine) {
      seekTo(previousLine.starttime);
    }
  }


  
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
        skipToVideo
      }}
    >
      {children}
    </VideoWithTranscriptContext.Provider>
  );
};