import React, { useCallback, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Play, Pause, SkipBack, SkipForward, RotateCcw } from 'lucide-react-native';
import { useT } from '@/hooks/use-t';
import type { YouTubePlayerHandle } from './YouTubePlayer';

const SPEEDS = [1, 0.75, 0.5] as const;

interface VideoControlBarProps {
  playerRef: React.RefObject<YouTubePlayerHandle | null>;
  currentTime: number;
  duration: number;
  paused: boolean;
  onPauseToggle: () => void;
  onRewind?: () => void;
  onPreviousVideo?: () => void;
  onNextVideo?: () => void;
  hasPreviousVideo?: boolean;
  hasNextVideo?: boolean;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function VideoControlBar({
  playerRef,
  currentTime,
  duration,
  paused,
  onPauseToggle,
  onRewind,
  onPreviousVideo,
  onNextVideo,
  hasPreviousVideo = false,
  hasNextVideo = false,
}: VideoControlBarProps) {
  const t = useT();
  const [speedIndex, setSpeedIndex] = useState(0);
  const currentSpeed = SPEEDS[speedIndex];

  const toggleSpeed = useCallback(() => {
    const next = (speedIndex + 1) % SPEEDS.length;
    setSpeedIndex(next);
    playerRef.current?.setPlaybackRate(SPEEDS[next]!);
  }, [speedIndex, playerRef]);

  const progress = duration > 0 ? currentTime / duration : 0;

  return (
    <View className="bg-card px-3 py-2">
      {/* Progress bar */}
      <Pressable
        className="mb-2 h-1 w-full rounded-full bg-muted"
        onPress={(e) => {
          // Approximate seek from press position — limited on RN without nativeEvent.locationX
        }}
      >
        <View className="h-full rounded-full bg-primary" style={{ width: `${Math.min(progress * 100, 100)}%` }} />
      </Pressable>

      {/* Time display */}
      <View className="flex-row justify-between px-1">
        <Text className="text-xs text-muted-foreground">{formatTime(currentTime)}</Text>
        <Text className="text-xs text-muted-foreground">{formatTime(duration)}</Text>
      </View>

      {/* Controls row */}
      <View className="mt-1 flex-row items-center justify-center gap-4">
        {/* Previous video */}
        <Pressable
          onPress={onPreviousVideo}
          disabled={!hasPreviousVideo}
          className={`p-2 ${!hasPreviousVideo ? 'opacity-30' : ''}`}
        >
          <SkipBack size={20} color="#fff" />
        </Pressable>

        {/* Rewind 2s */}
        <Pressable onPress={onRewind} className="p-2">
          <RotateCcw size={20} color="#fff" />
        </Pressable>

        {/* Play/Pause */}
        <Pressable onPress={onPauseToggle} className="rounded-full bg-primary p-3">
          {paused ? <Play size={22} color="#fff" /> : <Pause size={22} color="#fff" />}
        </Pressable>

        {/* Speed toggle */}
        <Pressable onPress={toggleSpeed} className="rounded bg-muted px-2 py-1">
          <Text className="text-xs font-bold text-foreground">{currentSpeed}×</Text>
        </Pressable>

        {/* Next video */}
        <Pressable
          onPress={onNextVideo}
          disabled={!hasNextVideo}
          className={`p-2 ${!hasNextVideo ? 'opacity-30' : ''}`}
        >
          <SkipForward size={20} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}
