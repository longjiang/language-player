// @/contexts/VideoWithTranscriptContext/index

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { YouTubeVideo, SyncedLine } from "@/types";
import { PLAYER_STATES } from "react-native-youtube-iframe";
import { findSubtitle } from "@/src/subs";
import { VideoWithTranscriptContextType } from "./types";
import { syncLines } from "@/src/subs";
import { useVideoPlayer } from "@/contexts/VideoPlayerContext";

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
  
  const videoPlayerContext = useVideoPlayer();

  // Merged usePlaylist logic
  const [video, setVideo] = useState<YouTubeVideo>(initialVideo);
  const [playlist, setPlaylist] = useState<YouTubeVideo[]>(initialPlaylist);
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);

  // Merged useSyncedLines logic
  const [syncedLines, setSyncedLines] = useState<SyncedLine[]>([]);

  const [currentLine, setCurrentLine] = useState<SyncedLine | null>(null);

  useEffect(() => {
    setVideo(initialVideo);
    const index = playlist.findIndex((v) => v.youtube_id === initialVideo.youtube_id);
    setCurrentVideoIndex(index);
  }, [initialVideo, playlist]);

  const updateVideo = useCallback((newVideo: YouTubeVideo) => {
    setVideo((prevVideo) => {
      if (prevVideo.youtube_id !== newVideo.youtube_id) {
        return newVideo;
      }
      return prevVideo;
    });
  }, []);

  useEffect(() => {
    if (currentVideoIndex < playlist.length) {
      const newVideo = playlist[currentVideoIndex];
      if (newVideo) {
        if (newVideo.youtube_id !== video.youtube_id) updateVideo(newVideo);
      }
    }
  }, [currentVideoIndex, playlist, updateVideo]);

  const skipToVideo = useCallback((index: number) => {
    const newVideo = playlist[index];
    if (isMainPlayer && videoPlayerContext) {
      videoPlayerContext.setVideoAndQueue(newVideo, playlist);
    } else if (index >= 0 && index < playlist.length) {
      setCurrentVideoIndex(index);
      updateVideo(newVideo);
    }
  }, [playlist, updateVideo, isMainPlayer, videoPlayerContext]);

  useEffect(() => {
    if (!video?.subs_l2?.length) {
      setSyncedLines([]);
      return;
    }
    const l1Lines = video.subs_l1 || [];
    const l2Lines = video.subs_l2 || [];
    const syncedLines = syncLines(l1Lines, l2Lines);
    setSyncedLines(syncedLines);
  }, [video?.subs_l2, video?.subs_l1]);

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