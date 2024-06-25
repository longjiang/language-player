import React, { createContext, useContext, useState, useEffect } from "react";
import { YouTubeVideo, Line, SyncedLine } from "@/types";
import { syncLines } from "@/src/subs";
import { PLAYER_STATES } from "react-native-youtube-iframe";

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
  updatePlaybackState: (state: string) => void;
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





const findSubtitle = (currentTime: number, syncedLines: SyncedLine[]) => {
  // Find the nearest subtitle
  let nearestSubtitle = null;
  for (let i = 0; i < syncedLines.length; i++) {
    if (currentTime >= syncedLines[i].starttime) {
      nearestSubtitle = syncedLines[i];
      // Continue searching until finding the last subtitle that meets the condition
      if (i + 1 < syncedLines.length && currentTime >= syncedLines[i + 1].starttime) {
        continue;
      } else {
        break;
      }
    }
  }
  return nearestSubtitle;
}





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
}> = ({ initialVideo, initialPlaylist, children }) => {
  initialPlaylist = initialPlaylist || [initialVideo];
  const [playbackState, setPlaybackState] = useState("stopped");
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
      const newVideo = playlist[currentVideoIndex];
      if (!newVideo) return
      setVideo(newVideo);
      setPlaybackState("stopped");
      setCurrentTime(0);
      // Sync subtitles when video changes
      if (newVideo.subs_l1 && newVideo.subs_l2) {
        setSyncedLines(syncLines(newVideo.subs_l1 || [], newVideo.subs_l2 || []));
      }
    }
  }, [currentVideoIndex, playlist]);

  useEffect(() => {
    if (!video?.subs_l2) return;
    const l1Lines = video.subs_l1 || [];
    const l2Lines = video.subs_l2 || [];
    const syncedLines = syncLines(l1Lines, l2Lines);
    setSyncedLines(syncedLines);
  }, [video]);




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

  const updatePlaybackState = (state: string) => {
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
      setCurrentVideoIndex(currentVideoIndex + 1); // Use state setter function
      setCurrentTime(0);
      setVideo(playlist[currentVideoIndex + 1]); // Access the next video correctly
    }
  };

  const skipToPreviousVideo = () => {
    if (currentVideoIndex > 0) {
      setCurrentVideoIndex(currentVideoIndex - 1); // Use state setter function
      setCurrentTime(0);
      setVideo(playlist[currentVideoIndex - 1]); // Access the previous video correctly
    }
  };

  const skipToVideo = (index: number) => {
    if (index >= 0 && index < playlist.length) {
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