import React, { useCallback, useRef, useState } from 'react';
import { View, Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useLanguage } from '@/contexts/LanguageContext';
import { useVideos } from '@langplayer/api-client';
import { YouTubePlayer, type YouTubePlayerHandle } from '@/components/video/YouTubePlayer';
import { VideoControlBar } from '@/components/video/VideoControlBar';
import { SubtitleDisplay } from '@/components/video/SubtitleDisplay';
import type { YouTubeVideo } from '@langplayer/shared';

export default function WatchScreen() {
  const { videoId } = useLocalSearchParams<{ videoId: string }>();
  const { l1Lang, l2Lang } = useLanguage();
  const { getById } = useVideos();

  const playerRef = useRef<YouTubePlayerHandle>(null);
  const [video, setVideo] = useState<YouTubeVideo | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [paused, setPaused] = useState(true);

  // Load video metadata
  React.useEffect(() => {
    if (!videoId) return;
    getById(videoId)
      .then((v) => {
        setVideo(v as YouTubeVideo);
        setDuration(v.duration ?? 0);
      })
      .catch(() => {});
  }, [videoId]);

  const handlePauseToggle = useCallback(() => {
    if (paused) {
      playerRef.current?.play();
    } else {
      playerRef.current?.pause();
    }
    setPaused(!paused);
  }, [paused]);

  const handleStateChange = useCallback((state: string) => {
    setPaused(state !== 'playing');
  }, []);

  const handleRewind = useCallback(() => {
    playerRef.current?.seekTo(Math.max(0, currentTime - 2));
  }, [currentTime]);

  if (!videoId) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Text className="text-muted-foreground">No video selected</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      {/* Video player */}
      <YouTubePlayer
        ref={playerRef}
        youtubeId={videoId}
        autoplay
        onTimeUpdate={setCurrentTime}
        onDuration={setDuration}
        onStateChange={handleStateChange}
      />

      {/* Control bar */}
      <VideoControlBar
        playerRef={playerRef}
        currentTime={currentTime}
        duration={duration}
        paused={paused}
        onPauseToggle={handlePauseToggle}
        onRewind={handleRewind}
      />

      {/* Video title */}
      {video?.title && (
        <View className="border-b border-border px-3 py-2">
          <Text className="text-base font-bold text-foreground" numberOfLines={2}>
            {video.title}
          </Text>
          {video.views ? (
            <Text className="mt-0.5 text-xs text-muted-foreground">
              {video.views.toLocaleString()} views
            </Text>
          ) : null}
        </View>
      )}

      {/* Subtitles */}
      <SubtitleDisplay
        youtubeId={videoId}
        currentTime={currentTime}
        videoTitle={video?.title}
      />
    </View>
  );
}
