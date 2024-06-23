// @/contexts/VideoWithTranscriptContext.tsx

import React, { createContext, useContext, useState, useEffect } from "react";
import { YouTubeVideo, Line, SyncedLine } from "@/types";
import Papa from "papaparse";

// Define the shape of the context
interface VideoWithTranscriptContextType {
  video: YouTubeVideo;
  playbackState: string;
  currentTime: number;
  seekTime?: number;
  playVideo: boolean;
  syncedLines: SyncedLine[];
  currentLine: SyncedLine;
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
const VideoWithTranscriptContext = createContext<
  VideoWithTranscriptContextType | undefined
>(undefined);



function syncLines(l1Lines: Line[], l2Lines: Line[]): SyncedLine[] {
  // Convert starttime to numbers and sort both arrays
  l1Lines = l1Lines
    .map((line) => ({ ...line, starttime: parseFloat(line.starttime) }))
    .sort((a, b) => a.starttime - b.starttime);
  l2Lines = l2Lines
    .map((line) => ({ ...line, starttime: parseFloat(line.starttime) }))
    .sort((a, b) => a.starttime - b.starttime);

  const syncedLines: SyncedLine[] = [];
  const usedIndexes = new Set<number>(); // To track used l2Lines

  // Find the closest l2Line for each l1Line
  l1Lines.forEach((l1Line) => {
    let closestIndex = -1;
    let smallestDifference = Infinity;

    for (let i = 0; i < l2Lines.length; i++) {
      if (!usedIndexes.has(i)) {
        const timeDifference = Math.abs(
          l1Line.starttime - l2Lines[i].starttime
        );
        if (timeDifference < smallestDifference) {
          smallestDifference = timeDifference;
          closestIndex = i;
        }
      }
    }

    if (closestIndex !== -1) {
      usedIndexes.add(closestIndex);
      syncedLines.push({
        starttime: l1Line.starttime,
        l1Line: l1Line.line,
        l2Line: l2Lines[closestIndex].line,
      });
    }
  });

  return syncedLines;
}



const findSubtitle = (currentTime, syncedLines) => {
  // Find the nearest subtitle
  let nearestSubtitle = '';
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

const parseSubtitles = (csvData) => {
  return Papa.parse(csvData, {
    header: true,
    dynamicTyping: true,
  }).data;
};





export const useVideoWithTranscriptContext = () => {
  const context = useContext(VideoWithTranscriptContext);
  if (!context) {
    throw new Error(
      "useVideoWithTranscriptContext must be used within a YouTubeVideoProvider"
    );
  }
  return context;
};

export const VideoWithTranscriptProvider: React.FC<{
  initialVideo: YouTubeVideo;
}> = ({ initialVideo, children }) => {
  const [playbackState, setPlaybackState] = useState("stopped");
  const [currentTime, setCurrentTime] = useState(0);
  const [seekTime, setSeekTime] = useState(0); // Watched for seeking
  const [playVideo, setPlayVideo] = useState(false); // Set to true to play, false to pause
  const [video, setVideo] = useState<YouTubeVideo>(initialVideo);
  const [syncedLines, setSyncedLines] = useState([]);
  const [currentLine, setCurrentLine] = useState(null);

  useEffect(() => {
    // Reset context state when the initialVideo changes
    setVideo(initialVideo);
  }, [initialVideo]);

  useEffect(() => {
    if (!video?.subs_l2) return;
    const l1Lines = parseSubtitles(video.subs_l1);
    const l2Lines = parseSubtitles(video.subs_l2);
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

  const resetSeekTime = () => {
    setSeekTime(null);
  };

  const seekTo = (time: number) => {
    setSeekTime(time);
    setCurrentTime(time);
  };

  const seekToNextLine = () => {
    // Logic to seek to the next line in the transcript goes here
  };

  const seekToPreviousLine = () => {
    // Logic to seek to the previous line in the transcript goes here
  };

  const skipToNextVideo = () => {
    if (currentVideoIndex < videoList.length - 1) {
      currentVideoIndex += 1;
      // Simulate loading the next video
      setCurrentTime(0);
      setPlaybackState("stopped");
      // Logic to change the video source goes here
    }
  };

  const skipToPreviousVideo = () => {
    if (currentVideoIndex > 0) {
      currentVideoIndex -= 1;
      // Simulate loading the previous video
      setCurrentTime(0);
      setPlaybackState("stopped");
      // Logic to change the video source goes here
    }
  };

  const updatePlayVideo = (newVal: boolean) => {
    setPlayVideo(newVal);
  };

  return (
    <VideoWithTranscriptContext.Provider
      value={{
        video,
        playbackState,
        currentTime,
        seekTime,
        playVideo,
        syncedLines,
        currentLine,
        resetSeekTime,
        seekToNextLine,
        seekToPreviousLine,
        updatePlaybackState,
        updateCurrentTime,
        seekTo,
        skipToNextVideo,
        skipToPreviousVideo,
        updatePlayVideo,
      }}
    >
      {children}
    </VideoWithTranscriptContext.Provider>
  );
};
