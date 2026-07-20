'use client';

import { useEffect, useRef, useCallback, useState, useImperativeHandle, forwardRef } from 'react';

interface YouTubePlayerProps {
  youtubeId: string;
  autoplay?: boolean;
  /** Resume playback from this time (seconds). Applied after player is ready. */
  startTime?: number;
  onTimeUpdate?: (time: number) => void;
  onDuration?: (duration: number) => void;
  onStateChange?: (state: number) => void;
  /** Called when the YouTube player fails to load (invalid ID, not embeddable, etc.) */
  onError?: (error: Error) => void;
}

export interface YouTubePlayerHandle {
  play: () => void;
  pause: () => void;
  seekTo: (seconds: number) => void;
  setPlaybackRate: (rate: number) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
}

// YouTube IFrame API states
const PLAYER_STATES = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
};

declare global {
  interface Window {
    onYouTubeIframeAPIReady?: () => void;
    YT?: {
      Player: new (
        elementId: string,
        options: {
          videoId: string;
          playerVars?: Record<string, unknown>;
          events?: Record<string, (event: unknown) => void>;
        },
      ) => YouTubePlayerInstance;
    };
  }
}

interface YouTubePlayerInstance {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  mute: () => void;
  unMute: () => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  destroy: () => void;
}

export const YouTubePlayer = forwardRef<YouTubePlayerHandle, YouTubePlayerProps>(
  function YouTubePlayer(
    { youtubeId, autoplay = false, startTime, onTimeUpdate, onDuration, onStateChange, onError },
    ref,
  ) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayerInstance | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const playerIdRef = useRef(`yt-player-${Math.random().toString(36).slice(2, 9)}`);
  const startAppliedRef = useRef(false);
  const [apiReady, setApiReady] = useState(false);
  const [playerError, setPlayerError] = useState<string | null>(null);

  // Load YouTube IFrame API
  useEffect(() => {
    if (window.YT?.Player) {
      setApiReady(true);
      return;
    }

    if (document.getElementById('yt-iframe-api')) {
      // Script already loading — wait for it
      const checkReady = setInterval(() => {
        if (window.YT?.Player) {
          clearInterval(checkReady);
          setApiReady(true);
        }
      }, 100);
      return () => clearInterval(checkReady);
    }

    // Inject the API script
    const tag = document.createElement('script');
    tag.id = 'yt-iframe-api';
    tag.src = 'https://www.youtube.com/iframe_api';
    const firstScript = document.getElementsByTagName('script')[0];
    firstScript?.parentNode?.insertBefore(tag, firstScript);

    window.onYouTubeIframeAPIReady = () => {
      setApiReady(true);
    };
  }, []);

  // Create player when API is ready
  useEffect(() => {
    if (!apiReady || !containerRef.current) return;

    // Destroy previous player
    playerRef.current?.destroy();
    setPlayerError(null);

    try {
      const player = new window.YT!.Player(playerIdRef.current, {
        videoId: youtubeId,
        playerVars: {
          autoplay: autoplay ? 1 : 0,
          modestbranding: 1,
          rel: 0,
          fs: 1,
          ...(startTime && startTime > 1 ? { start: Math.round(startTime) } : {}),
        },
        events: {
          onReady: () => {
            // Resume from saved position (only once per mount)
            if (startTime && startTime > 1 && !startAppliedRef.current) {
              startAppliedRef.current = true;
              const d = player.getDuration();
              // Only resume if not near the end (> 30s remaining)
              if (d <= 0 || startTime < d - 30) {
                player.seekTo(startTime, true);
              }
            }

            if (autoplay) player.playVideo();
            const duration = player.getDuration();
            if (duration > 0) onDuration?.(duration);

            // Poll current time
            timerRef.current = setInterval(() => {
              try {
                const time = player.getCurrentTime();
                if (time > 0) onTimeUpdate?.(time);
              } catch {
                // Player might not be ready
              }
            }, 500);
          },
          onStateChange: (event: any) => {
            onStateChange?.(event.data);
            if (event.data === PLAYER_STATES.PLAYING) {
              const duration = player.getDuration();
              if (duration > 0) onDuration?.(duration);
            }
          },
          onError: (event: any) => {
            const msg = `YouTube player error (code: ${event?.data ?? 'unknown'})`;
            setPlayerError(msg);
            onError?.(new Error(msg));
          },
        },
      });

      playerRef.current = player;
    } catch (err: any) {
      const msg = err?.message ?? 'Failed to load YouTube player';
      setPlayerError(msg);
      onError?.(err instanceof Error ? err : new Error(msg));
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      playerRef.current?.destroy();
    };
  }, [apiReady, youtubeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle autoplay changes
  useEffect(() => {
    if (autoplay) {
      playerRef.current?.playVideo();
    } else {
      playerRef.current?.pauseVideo();
    }
  }, [autoplay]);

  // Seek to a specific time
  const seekTo = useCallback((seconds: number) => {
    playerRef.current?.seekTo(seconds, true);
  }, []);

  const play = useCallback(() => playerRef.current?.playVideo(), []);
  const pause = useCallback(() => playerRef.current?.pauseVideo(), []);
  const setPlaybackRate = useCallback(
    (rate: number) => {
      // YouTube IFrame API: setPlaybackRate via player.setPlaybackRate
      try {
        const iframe = document.querySelector(`#${playerIdRef.current} iframe`) as HTMLIFrameElement | null;
        if (iframe?.contentWindow) {
          iframe.contentWindow.postMessage(
            JSON.stringify({ event: 'command', func: 'setPlaybackRate', args: [rate] }),
            '*',
          );
        }
      } catch { /* ignore */ }
    },
    [],
  );
  const getCurrentTime = useCallback(() => playerRef.current?.getCurrentTime() ?? 0, []);
  const getDuration = useCallback(() => playerRef.current?.getDuration() ?? 0, []);
  const getPlayerState = useCallback(() => playerRef.current?.getPlayerState() ?? -1, []);

  useImperativeHandle(ref, () => ({
    play,
    pause,
    seekTo,
    setPlaybackRate,
    getCurrentTime,
    getDuration,
    getPlayerState,
  }), [play, pause, seekTo, setPlaybackRate, getCurrentTime, getDuration, getPlayerState]);

  // Expose controls via ref or events — for now, YouTube's built-in controls handle this
  return (
    <div className="relative w-full overflow-hidden rounded-xl bg-black">
      <div className="aspect-video">
        {playerError ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <svg className="h-10 w-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p className="text-sm">This video cannot be played in the embedded player.</p>
            <p className="text-xs text-muted-foreground/60">The transcript is still available below.</p>
          </div>
        ) : (
          <div ref={containerRef} id={playerIdRef.current} className="h-full w-full" />
        )}
      </div>
    </div>
  );
});

export { PLAYER_STATES };
