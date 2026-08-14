'use client';

import { useEffect, useRef, useCallback, useState, useImperativeHandle, forwardRef, useId } from 'react';
import { useT } from '@/hooks/use-t';

interface YouTubePlayerProps {
  youtubeId: string;
  autoplay?: boolean;
  /** Resume playback from this time (seconds). Applied after player is ready. */
  startTime?: number;
  onTimeUpdate?: (time: number) => void;
  onDuration?: (duration: number) => void;
  onStateChange?: (state: number) => void;
  /** Called when the YouTube player fails to load (invalid ID, not embeddable, etc.) */
  onError?: (error: Error, info?: YouTubePlayerErrorInfo) => void;
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

/**
 * YouTube's IFrame API starts its "listening" handshake immediately after
 * creating the embed, before the iframe has finished navigating. Until then
 * the iframe's contentWindow is the initial about:blank document (which
 * inherits the host page's origin), so the handshake throws a benign
 * DOMException:
 *   "Failed to execute 'postMessage' on 'DOMWindow': The target origin
 *    provided ('https://www.youtube.com') does not match the recipient
 *    window's origin ('http://localhost:3000')."
 * Playback is unaffected — once the iframe loads, the handshake succeeds.
 * We suppress only that specific race so the console stays clean; real
 * player failures still surface through onError.
 */
function isYouTubePostMessageRace(message: string): boolean {
  return (
    message.includes("Failed to execute 'postMessage' on 'DOMWindow'") &&
    message.includes('https://www.youtube.com') &&
    message.includes("does not match the recipient window's origin")
  );
}

interface PlayerErrorInfo {
  /** Translation key for the user-facing message. */
  messageKey: string;
  /** YouTube IFrame API error code, when known. */
  code?: number;
  /** The uploader disabled embedding — offer a link out to YouTube. */
  embedBlocked?: boolean;
  /** Fatal load/embed failure — safe to auto-skip this video in a result list. */
  skippable: boolean;
}

/** Error metadata passed to onError callers (e.g. subs-search auto-skip). */
export interface YouTubePlayerErrorInfo {
  /** YouTube IFrame API error code, when known. */
  code?: number;
  messageKey: string;
  skippable: boolean;
}

// YouTube IFrame API onError codes:
//   2    invalid parameter (bad video ID)
//   5    cannot play in the HTML5 player
//   100  video removed or made private
//   101/150  embedding disabled by the uploader
const YOUTUBE_ERRORS: Record<number, PlayerErrorInfo> = {
  2: { messageKey: 'msg.youtube_error_invalid_id', skippable: true },
  5: { messageKey: 'msg.youtube_error_html5', skippable: true },
  100: { messageKey: 'msg.video_unavailable', skippable: true },
  101: { messageKey: 'msg.youtube_error_embed_disabled', embedBlocked: true, skippable: true },
  150: { messageKey: 'msg.youtube_error_embed_disabled', embedBlocked: true, skippable: true },
};

function toPlayerError(code: number | undefined): PlayerErrorInfo {
  if (code === undefined || Number.isNaN(code)) {
    return { messageKey: 'msg.youtube_error_generic', skippable: false };
  }
  return {
    ...(YOUTUBE_ERRORS[code] ?? { messageKey: 'msg.youtube_error_generic', skippable: false }),
    code,
  };
}

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
  cueVideoById: (
    options: { videoId: string; startSeconds?: number },
    startSeconds?: number,
  ) => void;
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
  const uid = useId();
  const playerIdRef = useRef(`yt-player-${uid}`);
  const startAppliedRef = useRef(false);
  const [apiReady, setApiReady] = useState(false);
  const [playerError, setPlayerError] = useState<PlayerErrorInfo | null>(null);
  const t = useT();

  // Silence the transient postMessage race described above (see
  // isYouTubePostMessageRace). preventDefault() stops Chrome from printing
  // the uncaught DOMException without affecting any other error reporting.
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      if (isYouTubePostMessageRace(event.message)) {
        event.preventDefault();
      }
    };
    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

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
                if (autoplay) {
                  player.seekTo(startTime, true);
                } else {
                  // seekTo from the UNSTARTED/CUED state starts playback, so
                  // cue the video at the position instead — cueing does not play.
                  player.cueVideoById({ videoId: youtubeId, startSeconds: startTime });
                }
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
            const code = Number(event?.data);
            const info = toPlayerError(Number.isFinite(code) ? code : undefined);
            setPlayerError(info);
            const msg = `YouTube player error (code: ${Number.isFinite(code) ? code : 'unknown'})`;
            onError?.(new Error(msg), {
              code: Number.isFinite(code) ? code : undefined,
              messageKey: info.messageKey,
              skippable: info.skippable,
            });
          },
        },
      });

      playerRef.current = player;
    } catch (err: any) {
      setPlayerError({ messageKey: 'msg.youtube_error_generic', skippable: false });
      onError?.(err instanceof Error ? err : new Error('Failed to load YouTube player'), {
        messageKey: 'msg.youtube_error_generic',
        skippable: false,
      });
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [apiReady, youtubeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle autoplay changes
  useEffect(() => {
    const p = playerRef.current;
    if (!p) return;
    if (autoplay) {
      if (typeof p.playVideo === 'function') p.playVideo();
    } else {
      if (typeof p.pauseVideo === 'function') p.pauseVideo();
    }
  }, [autoplay]);

  // Seek to a specific time
  const seekTo = useCallback((seconds: number) => {
    if (playerRef.current && typeof playerRef.current.seekTo === 'function') {
      playerRef.current.seekTo(seconds, true);
    }
  }, []);

  const play = useCallback(() => {
    if (playerRef.current && typeof playerRef.current.playVideo === 'function') {
      playerRef.current.playVideo();
    }
  }, []);
  const pause = useCallback(() => {
    if (playerRef.current && typeof playerRef.current.pauseVideo === 'function') {
      playerRef.current.pauseVideo();
    }
  }, []);
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
      {/* The player container must stay mounted even while an error overlay is
          shown: the creation effect bails out when containerRef.current is
          null, which would leave a stale error (and no player) after the user
          navigates to the next/previous video. */}
      <div className="relative aspect-video">
        <div ref={containerRef} id={playerIdRef.current} className="h-full w-full" />
        {playerError && (
          <div className="absolute inset-0 z-10 flex h-full w-full flex-col items-center justify-center gap-2 bg-black px-4 text-center text-muted-foreground">
            <p className="text-sm">{t(playerError.messageKey)}</p>
            {playerError.embedBlocked && (
              <a
                href={`https://www.youtube.com/watch?v=${youtubeId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium text-primary transition-colors hover:text-primary/80"
              >
                {t('action.view_on_youtube')} ↗
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

export { PLAYER_STATES };
