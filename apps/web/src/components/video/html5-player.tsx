'use client';

import { useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from 'react';

export interface YouTubePlayerHandle {
  play: () => void;
  pause: () => void;
  seekTo: (seconds: number) => void;
  setPlaybackRate: (rate: number) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
}

// Matching YouTube player state constants so VideoControlBar works unchanged
export const PLAYER_STATES = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
};

interface HTML5PlayerProps {
  src: string;
  isAudio?: boolean;
  autoplay?: boolean;
  /** Resume playback from this time (seconds). */
  startTime?: number;
  onTimeUpdate?: (time: number) => void;
  onDuration?: (duration: number) => void;
  onStateChange?: (state: number) => void;
  onError?: (error: Error) => void;
}

/**
 * HTML5 <video>/<audio> player with the same imperative handle API
 * as YouTubePlayer. Drop-in replacement — works with VideoControlBar
 * and keyboard shortcuts without any changes.
 */
export const HTML5Player = forwardRef<YouTubePlayerHandle, HTML5PlayerProps>(
  function HTML5Player(
    { src, isAudio = false, autoplay = false, startTime, onTimeUpdate, onDuration, onStateChange, onError },
    ref,
  ) {
    const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement>(null);
    const startAppliedRef = useRef(false);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Expose imperative handle (same API as YouTubePlayer)
    useImperativeHandle(ref, () => ({
      play: () => { mediaRef.current?.play(); },
      pause: () => { mediaRef.current?.pause(); },
      seekTo: (seconds: number) => {
        if (mediaRef.current) mediaRef.current.currentTime = seconds;
      },
      setPlaybackRate: (rate: number) => {
        if (mediaRef.current) mediaRef.current.playbackRate = rate;
      },
      getCurrentTime: () => mediaRef.current?.currentTime ?? 0,
      getDuration: () => mediaRef.current?.duration ?? 0,
      getPlayerState: () => {
        const el = mediaRef.current;
        if (!el) return PLAYER_STATES.UNSTARTED;
        if (el.paused) return el.ended ? PLAYER_STATES.ENDED : PLAYER_STATES.PAUSED;
        return PLAYER_STATES.PLAYING;
      },
    }), []);

    // Poll time updates every 500ms (matching YouTubePlayer behavior)
    useEffect(() => {
      timerRef.current = setInterval(() => {
        const el = mediaRef.current;
        if (el && onTimeUpdate) onTimeUpdate(el.currentTime);
      }, 500);
      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
      };
    }, [onTimeUpdate]);

    // Apply start time once metadata is loaded
    const handleLoadedMetadata = useCallback(() => {
      const el = mediaRef.current;
      if (!el) return;
      if (onDuration) onDuration(el.duration);
      if (startTime && startTime > 0 && !startAppliedRef.current) {
        startAppliedRef.current = true;
        el.currentTime = startTime;
      }
    }, [startTime, onDuration]);

    // Reset start applied when src changes
    useEffect(() => {
      startAppliedRef.current = false;
    }, [src]);

    const handlePlay = useCallback(() => onStateChange?.(PLAYER_STATES.PLAYING), [onStateChange]);
    const handlePause = useCallback(() => onStateChange?.(PLAYER_STATES.PAUSED), [onStateChange]);
    const handleEnded = useCallback(() => onStateChange?.(PLAYER_STATES.ENDED), [onStateChange]);
    const handleError = useCallback(() => {
      const err = mediaRef.current?.error;
      onError?.(new Error(err?.message ?? 'Media playback error'));
    }, [onError]);

    if (isAudio) {
      return (
        <div className="rounded-xl border border-border bg-card p-8">
          <div className="flex flex-col items-center gap-4">
            <div className="text-4xl" aria-hidden="true">🎵</div>
            <p className="text-sm font-medium text-muted-foreground">
              {src ? decodeURIComponent(src.split('/').pop()?.split('?')[0] ?? '') : ''}
            </p>
            <audio
              ref={mediaRef as React.RefObject<HTMLAudioElement>}
              src={src}
              autoPlay={autoplay}
              onLoadedMetadata={handleLoadedMetadata}
              onPlay={handlePlay}
              onPause={handlePause}
              onEnded={handleEnded}
              onError={handleError}
              className="w-full"
              controls={false}
            />
          </div>
        </div>
      );
    }

    return (
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
        <video
          ref={mediaRef as React.RefObject<HTMLVideoElement>}
          src={src}
          autoPlay={autoplay}
          onLoadedMetadata={handleLoadedMetadata}
          onPlay={handlePlay}
          onPause={handlePause}
          onEnded={handleEnded}
          onError={handleError}
          className="h-full w-full"
          controls={false}
          playsInline
        />
      </div>
    );
  },
);
