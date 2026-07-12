'use client';

import { useEffect, useRef, useCallback, useState } from 'react';

interface YouTubePlayerProps {
  youtubeId: string;
  autoplay?: boolean;
  onTimeUpdate?: (time: number) => void;
  onDuration?: (duration: number) => void;
  onStateChange?: (state: number) => void;
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

export function YouTubePlayer({
  youtubeId,
  autoplay = false,
  onTimeUpdate,
  onDuration,
  onStateChange,
}: YouTubePlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayerInstance | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const playerIdRef = useRef(`yt-player-${Math.random().toString(36).slice(2, 9)}`);
  const [apiReady, setApiReady] = useState(false);

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

    const player = new window.YT!.Player(playerIdRef.current, {
      videoId: youtubeId,
      playerVars: {
        autoplay: autoplay ? 1 : 0,
        modestbranding: 1,
        rel: 0,
        fs: 1,
      },
      events: {
        onReady: () => {
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
      },
    });

    playerRef.current = player;

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      player.destroy();
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

  // Expose controls via ref or events — for now, YouTube's built-in controls handle this
  return (
    <div className="relative w-full overflow-hidden rounded-xl bg-black">
      <div className="aspect-video">
        <div ref={containerRef} id={playerIdRef.current} className="h-full w-full" />
      </div>
    </div>
  );
}

export { PLAYER_STATES };
