import React, { useCallback, useRef, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useLanguage } from '@/contexts/LanguageContext';
import { useT } from '@/hooks/use-t';
import { useVideos } from '@langplayer/api-client';
import { YouTubePlayer, type YouTubePlayerHandle } from '@/components/video/YouTubePlayer';
import { VideoControlBar } from '@/components/video/VideoControlBar';
import { SubtitleDisplay } from '@/components/video/SubtitleDisplay';
import { useSettingsContext } from '@/contexts/SettingsContext';
import { Languages } from 'lucide-react-native';
import { ICON_MUTED } from '@/lib/theme-colors';
import type { YouTubeVideo } from '@langplayer/shared';

export default function WatchScreen() {
  const { videoId } = useLocalSearchParams<{ videoId: string }>();
  const { l1Lang, l2Lang } = useLanguage();
  const t = useT();
  const { getById } = useVideos();
  const { display, set } = useSettingsContext();

  const playerRef = useRef<YouTubePlayerHandle>(null);
  const [video, setVideo] = useState<YouTubeVideo | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  // Start paused — autoplay is unreliable on iOS and causes state mismatch.
  // User explicitly taps play to start. Matches GO app behavior.
  const [paused, setPaused] = useState(true);

  // Subtitle line navigation state
  const subtitleStartTimesRef = useRef<number[]>([]);
  const [activeLineIndex, setActiveLineIndex] = useState(-1);

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
    // Call the imperative method FIRST, then update state.
    // Do NOT put side effects inside setState updater functions —
    // React calls them during render phase.
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

  const handleLinesLoaded = useCallback((startTimes: number[]) => {
    subtitleStartTimesRef.current = startTimes;
  }, []);

  const handleSeekToLine = useCallback((starttime: number) => {
    playerRef.current?.seekTo(starttime);
  }, []);

  const handlePreviousLine = useCallback(() => {
    const times = subtitleStartTimesRef.current;
    if (times.length === 0) return;
    // Find the line just before current time
    let idx = -1;
    for (let i = times.length - 1; i >= 0; i--) {
      if (times[i]! < currentTime - 0.5) { idx = i; break; }
    }
    if (idx >= 0) {
      setActiveLineIndex(idx);
      playerRef.current?.seekTo(Math.max(0, times[idx]! - 0.1));
    }
  }, [currentTime]);

  const handleNextLine = useCallback(() => {
    const times = subtitleStartTimesRef.current;
    if (times.length === 0) return;
    // Find the line just after current time
    let idx = -1;
    for (let i = 0; i < times.length; i++) {
      if (times[i]! > currentTime + 0.3) { idx = i; break; }
    }
    if (idx >= 0) {
      setActiveLineIndex(idx);
      playerRef.current?.seekTo(times[idx]!);
    }
  }, [currentTime]);

  if (!videoId) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Text className="text-muted-foreground">{t('msg.no_videos_found')}</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      {/* Video player */}
      <YouTubePlayer
        ref={playerRef}
        youtubeId={videoId}
        autoplay={false}
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
        onPreviousLine={handlePreviousLine}
        onNextLine={handleNextLine}
      />

      {/* Video title + translation toggle */}
      {video?.title && (
        <View className="flex-row items-center justify-between border-b border-border px-3 py-2">
          <View className="flex-1">
            <Text className="text-base font-bold text-foreground" numberOfLines={2}>
              {video.title}
            </Text>
            {video.views ? (
              <Text className="mt-0.5 text-xs text-muted-foreground">
                {t('label.views_count', { count: video.views.toLocaleString() })}
              </Text>
            ) : null}
          </View>
          <Pressable
            onPress={() => set('display.translation', !display.translation)}
            className={`ml-2 rounded-full p-2 ${display.translation ? 'bg-primary/20' : 'bg-muted'}`}
          >
            <Languages size={18} color={display.translation ? '#3b82f6' : ICON_MUTED} />
          </Pressable>
        </View>
      )}

      {/* Subtitles */}
      <SubtitleDisplay
        youtubeId={videoId}
        currentTime={currentTime}
        videoTitle={video?.title}
        onLinesLoaded={handleLinesLoaded}
        onSeekToLine={handleSeekToLine}
      />
    </View>
  );
}
