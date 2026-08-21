import React, { useCallback, useState } from 'react';
import { View, Text } from 'react-native';
import { Pressable } from '@/components/ui/pressable';
import {
  Play, Pause, SkipBack, SkipForward, RotateCcw,
  ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
  Info, Clock, PanelRightOpen, PanelRightClose, Heart, Bookmark,
} from 'lucide-react-native';
import { useT } from '@/hooks/use-t';
import { ICON_MUTED, ICON_ON_PRIMARY, ICON_DESTRUCTIVE } from '@/lib/theme-colors';
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
  onTogglePanel?: () => void;
  /** Whether the transcript/queue panel is currently open. */
  panelOpen?: boolean;
  hasPreviousLine?: boolean;
  hasNextLine?: boolean;
  hasPreviousVideo?: boolean;
  hasNextVideo?: boolean;
  /** Like state + handler. When omitted, the heart button is hidden. */
  liked?: boolean;
  onToggleLike?: () => void;
  likeDisabled?: boolean;
  /** Add-to-playlist handler. When omitted, the bookmark button is hidden. */
  onSaveToPlaylist?: () => void;
  playlistDisabled?: boolean;
  /** Optional count text shown between the previous/next line buttons. */
  videoCountText?: string | null;
  /** When true, only shows LP-specific controls: ⏮ ← → ⏭ ◧. No progress, time, play, rewind, or speed. */
  reduced?: boolean;
  /** Uses the subtitles-band order: previous video, previous line, like, playlist, panel, next line, next video. */
  subtitlesBand?: boolean;
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
  onTogglePanel,
  panelOpen = true,
  hasPreviousLine = true,
  hasNextLine = true,
  hasPreviousVideo = false,
  hasNextVideo = false,
  liked = false,
  onToggleLike,
  likeDisabled = false,
  onSaveToPlaylist,
  playlistDisabled = false,
  videoCountText,
  reduced = false,
  subtitlesBand = false,
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
  const reducedIconColor = subtitlesBand ? ICON_ON_PRIMARY : ICON_MUTED;

  // ── Reduced mode: compact inline bar with only LP-specific controls ──
  if (reduced) {
    return (
      <View className="flex-row items-center gap-0.5">
        <Pressable
          onPress={onPreviousVideo}
          disabled={!hasPreviousVideo || !onPreviousVideo}
          className={`rounded p-1.5 ${!hasPreviousVideo || !onPreviousVideo ? 'opacity-30' : 'active:bg-muted'}`}
        >
          <SkipBack size={16} color={reducedIconColor} />
        </Pressable>
        <Pressable
          onPress={onPreviousLine}
          disabled={!hasPreviousLine}
          className={`rounded p-1.5 ${!hasPreviousLine ? 'opacity-30' : 'active:bg-muted'}`}
        >
          <ChevronLeft size={18} color={reducedIconColor} />
        </Pressable>
        {!subtitlesBand && videoCountText ? (
          <Text className="px-1 text-xs tabular-nums text-muted-foreground">{videoCountText}</Text>
        ) : null}
        {subtitlesBand && onToggleLike && (
          <Pressable
            onPress={onToggleLike}
            disabled={likeDisabled}
            className={`rounded p-1.5 ${likeDisabled ? 'opacity-30' : 'active:bg-muted'}`}
          >
            <Heart size={16} color={liked ? ICON_DESTRUCTIVE : reducedIconColor} fill={liked ? ICON_DESTRUCTIVE : 'transparent'} />
          </Pressable>
        )}
        {subtitlesBand && onSaveToPlaylist && (
          <Pressable
            onPress={onSaveToPlaylist}
            disabled={playlistDisabled}
            className={`rounded p-1.5 ${playlistDisabled ? 'opacity-30' : 'active:bg-muted'}`}
          >
            <Bookmark size={16} color={reducedIconColor} />
          </Pressable>
        )}
        {subtitlesBand && onTogglePanel && (
          <Pressable onPress={onTogglePanel} className="rounded p-1.5 active:bg-muted">
            {panelOpen ? (
              <PanelRightClose size={16} color={reducedIconColor} />
            ) : (
              <PanelRightOpen size={16} color={reducedIconColor} />
            )}
          </Pressable>
        )}
        <Pressable
          onPress={onNextLine}
          disabled={!hasNextLine}
          className={`rounded p-1.5 ${!hasNextLine ? 'opacity-30' : 'active:bg-muted'}`}
        >
          <ChevronRight size={18} color={reducedIconColor} />
        </Pressable>
        <Pressable
          onPress={onNextVideo}
          disabled={!hasNextVideo || !onNextVideo}
          className={`rounded p-1.5 ${!hasNextVideo || !onNextVideo ? 'opacity-30' : 'active:bg-muted'}`}
        >
          <SkipForward size={16} color={reducedIconColor} />
        </Pressable>
        {!subtitlesBand && onToggleLike && (
          <Pressable
            onPress={onToggleLike}
            disabled={likeDisabled}
            className={`rounded p-1.5 ${likeDisabled ? 'opacity-30' : 'active:bg-muted'}`}
          >
            <Heart size={16} color={liked ? ICON_DESTRUCTIVE : ICON_MUTED} fill={liked ? ICON_DESTRUCTIVE : 'transparent'} />
          </Pressable>
        )}
        {!subtitlesBand && onSaveToPlaylist && (
          <Pressable
            onPress={onSaveToPlaylist}
            disabled={playlistDisabled}
            className={`rounded p-1.5 ${playlistDisabled ? 'opacity-30' : 'active:bg-muted'}`}
          >
            <Bookmark size={16} color={ICON_MUTED} />
          </Pressable>
        )}
        {!subtitlesBand && onTogglePanel && (
          <Pressable onPress={onTogglePanel} className="rounded p-1.5 active:bg-muted">
            {panelOpen ? (
              <PanelRightClose size={16} color={ICON_MUTED} />
            ) : (
              <PanelRightOpen size={16} color={ICON_MUTED} />
            )}
          </Pressable>
        )}
      </View>
    );
  }

  // ── Full mode ──
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
        <Clock size={12} color={ICON_MUTED} />
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
          <SkipBack size={18} color={ICON_MUTED} />
        </Pressable>

        {/* Info */}
        {onOpenInfo && (
          <Pressable onPress={onOpenInfo} className="rounded p-2">
            <Info size={18} color={ICON_MUTED} />
          </Pressable>
        )}

        {/* Previous subtitle line */}
        <Pressable
          onPress={onPreviousLine}
          disabled={!hasPreviousLine}
          className={`rounded p-2 ${!hasPreviousLine ? 'opacity-30' : ''}`}
        >
          <ChevronUp size={20} color={ICON_MUTED} />
        </Pressable>

        {/* Rewind 2s */}
        <Pressable onPress={handleRewind} className="rounded p-2">
          <RotateCcw size={18} color={ICON_MUTED} />
        </Pressable>

        {/* Play/Pause */}
        <Pressable onPress={onPauseToggle} className="mx-1 rounded-full bg-primary p-3">
          {paused ? <Play size={22} color={ICON_ON_PRIMARY} /> : <Pause size={22} color={ICON_ON_PRIMARY} />}
        </Pressable>

        {/* Next subtitle line */}
        <Pressable
          onPress={onNextLine}
          disabled={!hasNextLine}
          className={`rounded p-2 ${!hasNextLine ? 'opacity-30' : ''}`}
        >
          <ChevronDown size={20} color={ICON_MUTED} />
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
          <SkipForward size={18} color={ICON_MUTED} />
        </Pressable>
      </View>
    </View>
  );
}
