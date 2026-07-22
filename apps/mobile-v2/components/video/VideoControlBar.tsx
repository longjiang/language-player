import React, { useCallback, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import {
  Play, Pause, SkipBack, SkipForward, RotateCcw,
  ChevronUp, ChevronDown, Info, Clock,
} from 'lucide-react-native';
import { useT } from '@/hooks/use-t';
import type { YouTubePlayerHandle } from './YouTubePlayer';

// Speed options matching Next.js: 1× → 0.75× → 0.5× → 1×
const SPEEDS = [1, 0.75, 0.5] as const;

interface VideoControlBarProps {
  playerRef: React.RefObject<YouTubePlayerHandle | null>;
  currentTime: number;
  duration: number;
  paused: boolean;
  onPauseToggle: () => void;
  onRewind?: () => void;
  onPreviousLine?: () => void;
  onNextLine?: () => void;
  onOpenInfo?: () => void;
  onPreviousVideo?: () => void;
  onNextVideo?: () => void;
  hasPreviousLine?: boolean;
  hasNextLine?: boolean;
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
  onPreviousLine,
  onNextLine,
  onOpenInfo,
  onPreviousVideo,
  onNextVideo,
  hasPreviousLine = true,
  hasNextLine = true,
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

  const handleRewind = useCallback(() => {
    if (onRewind) {
      onRewind();
    } else {
      playerRef.current?.seekTo(Math.max(0, currentTime - 2));
    }
  }, [onRewind, currentTime, playerRef]);

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
      <View className="flex-row items-center justify-center gap-1">
        <Clock size={12} color="#94a3b8" />
        <Text className="text-xs text-muted-foreground">{formatTime(currentTime)}</Text>
        <Text className="text-xs text-muted-foreground">/</Text>
        <Text className="text-xs text-muted-foreground">{formatTime(duration)}</Text>
      </View>

      {/* Controls row — matches Next.js order */}
      <View className="mt-1 flex-row items-center justify-center gap-1">
        {/* Previous video (queue) */}
        <Pressable
          onPress={onPreviousVideo}
          disabled={!hasPreviousVideo || !onPreviousVideo}
          className={`rounded p-2 ${!hasPreviousVideo || !onPreviousVideo ? 'opacity-30' : ''}`}
        >
          <SkipBack size={18} color="#94a3b8" />
        </Pressable>

        {/* Info */}
        {onOpenInfo && (
          <Pressable onPress={onOpenInfo} className="rounded p-2">
            <Info size={18} color="#94a3b8" />
          </Pressable>
        )}

        {/* Previous subtitle line */}
        <Pressable
          onPress={onPreviousLine}
          disabled={!hasPreviousLine}
          className={`rounded p-2 ${!hasPreviousLine ? 'opacity-30' : ''}`}
        >
          <ChevronUp size={20} color="#94a3b8" />
        </Pressable>

        {/* Rewind 2s */}
        <Pressable onPress={handleRewind} className="rounded p-2">
          <RotateCcw size={18} color="#94a3b8" />
        </Pressable>

        {/* Play/Pause */}
        <Pressable onPress={onPauseToggle} className="mx-1 rounded-full bg-primary p-3">
          {paused ? <Play size={22} color="#ffffff" /> : <Pause size={22} color="#ffffff" />}
        </Pressable>

        {/* Next subtitle line */}
        <Pressable
          onPress={onNextLine}
          disabled={!hasNextLine}
          className={`rounded p-2 ${!hasNextLine ? 'opacity-30' : ''}`}
        >
          <ChevronDown size={20} color="#94a3b8" />
        </Pressable>

        {/* Speed toggle */}
        <Pressable onPress={toggleSpeed} className="rounded bg-muted px-2 py-1">
          <Text className="text-xs font-bold text-foreground">{currentSpeed}×</Text>
        </Pressable>

        {/* Next video (queue) */}
        <Pressable
          onPress={onNextVideo}
          disabled={!hasNextVideo || !onNextVideo}
          className={`rounded p-2 ${!hasNextVideo || !onNextVideo ? 'opacity-30' : ''}`}
        >
          <SkipForward size={18} color="#94a3b8" />
        </Pressable>
      </View>
    </View>
  );
}
