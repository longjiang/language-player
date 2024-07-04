// @/contexts/VideoWithTranscriptContext/usePlaylist

import { useState, useEffect, useCallback } from "react";
import { YouTubeVideo } from "@/types";

export const usePlaylist = (initialVideo: YouTubeVideo, initialPlaylist: YouTubeVideo[]) => {
  const [video, setVideo] = useState<YouTubeVideo>(initialVideo);
  const [playlist, setPlaylist] = useState<YouTubeVideo[]>(initialPlaylist);
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);

  useEffect(() => {
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
        updateVideo(newVideo);
      }
    }
  }, [currentVideoIndex, playlist, updateVideo]);

  const skipToVideo = useCallback((index: number) => {
    if (index >= 0 && index < playlist.length) {
      setCurrentVideoIndex(index);
      updateVideo(playlist[index]);
    }
  }, [playlist, updateVideo]);

  return {
    video,
    playlist,
    currentVideoIndex,
    skipToVideo,
  };
};