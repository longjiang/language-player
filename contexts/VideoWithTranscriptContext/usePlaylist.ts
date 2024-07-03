// @/contexts/VideoWithTranscriptContext/usePlaylist

import { useState, useEffect } from "react";
import { PLAYER_STATES } from "react-native-youtube-iframe";
import { YouTubeVideo } from "@/types";

export const usePlaylist = (initialVideo: YouTubeVideo, initialPlaylist: YouTubeVideo[]) => {
  const [video, setVideo] = useState<YouTubeVideo>(initialVideo);
  const [playlist, setPlaylist] = useState<YouTubeVideo[]>(initialPlaylist);
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);

  useEffect(() => {
    const index = playlist.findIndex((video) => video.youtube_id === initialVideo.youtube_id);
    setCurrentVideoIndex(index);
  }, [initialVideo]);

  useEffect(() => {
    if (currentVideoIndex < playlist.length) {
      const newVideo = playlist[currentVideoIndex];
      if (!newVideo) return;
      setVideo(newVideo);
    }
  }, [currentVideoIndex, playlist]);

  const skipToVideo = (index: number) => {
    if (index >= 0 && index < playlist.length) {
      setCurrentVideoIndex(index);
      setVideo(playlist[index]);
    }
  };

  return {
    video,
    playlist,
    currentVideoIndex,
    skipToVideo,
  };
};