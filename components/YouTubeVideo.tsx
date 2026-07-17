// @/components/YouTubeVideo.tsx
// YouTube player using react-native-youtube-iframe.

import { useRef, useEffect, useCallback, useMemo } from "react";
import YoutubePlayer, { YoutubeIframeRef } from "react-native-youtube-iframe";
import {
  useVideoWithTranscriptContext,
} from "@/contexts/VideoWithTranscriptContext";
import { PLAYER_STATES } from "@/constants/PlayerStates";

// ── Types ──────────────────────────────────────────────────────────────────

interface YouTubeVideoProps {
  youtubeId: string;
  autoplay?: boolean;
  mute?: boolean;
  startTime?: number;
  height?: number;
  controls?: boolean;
}

// ── Component ──────────────────────────────────────────────────────────────

export const YouTubeVideo: React.FC<YouTubeVideoProps> = ({
  youtubeId,
  autoplay = false,
  mute = false,
  startTime = 0,
  height = 300,
  controls = true,
}) => {
  const playerRef = useRef<YoutubeIframeRef>(null);

  // ── Context ────────────────────────────────────────────────────────────
  let playbackState: PLAYER_STATES = PLAYER_STATES.UNSTARTED;
  let currentTime = 0;
  let inVideoWithTranscriptProvider = false;
  let playVideo = autoplay;
  let seekTime: number | undefined;
  let resetSeekTime: () => void = () => {};
  let updatePlaybackState: (state: PLAYER_STATES) => void = () => {};
  let updateCurrentTime: (time: number, isSeeking?: boolean) => void = () => {};
  let updateDuration: (duration: number) => void = () => {};
  let updatePlayVideo: (isPlaying: boolean) => void = () => {};

  try {
    const context = useVideoWithTranscriptContext();
    playbackState = context.playbackState;
    currentTime = context.currentTime;
    resetSeekTime = context.resetSeekTime;
    updatePlaybackState = context.updatePlaybackState;
    updateCurrentTime = context.updateCurrentTime;
    updateDuration = context.updateDuration;
    playVideo = context.playVideo;
    updatePlayVideo = context.updatePlayVideo;
    inVideoWithTranscriptProvider = true;
    seekTime = context.seekTime;
  } catch (_error) {
    // Not wrapped in a VideoWithTranscriptProvider — operate standalone
  }

  // ── Sync play / pause ──────────────────────────────────────────────────
  const prevPlayRef = useRef(playVideo);
  useEffect(() => {
    if (prevPlayRef.current !== playVideo) {
      if (playVideo) {
        playerRef.current?.play();
      } else {
        playerRef.current?.pause();
      }
    }
    prevPlayRef.current = playVideo;
  }, [playVideo]);

  // ── Handle seek (context-driven) ───────────────────────────────────────
  const prevSeekRef = useRef(seekTime);
  useEffect(() => {
    if (
      inVideoWithTranscriptProvider &&
      seekTime !== undefined &&
      seekTime !== prevSeekRef.current
    ) {
      playerRef.current?.seekTo(currentTime, true);
      resetSeekTime();
    }
    prevSeekRef.current = seekTime;
  }, [seekTime, currentTime, inVideoWithTranscriptProvider, resetSeekTime]);

  // ── Player callbacks ───────────────────────────────────────────────────
  const onStateChange = useCallback(
    (state: string) => {
      if (inVideoWithTranscriptProvider) {
        const newState = state as unknown as PLAYER_STATES;
        updatePlaybackState(newState);
        if (newState === PLAYER_STATES.PLAYING) {
          updatePlayVideo(true);
        } else if (newState === PLAYER_STATES.PAUSED) {
          updatePlayVideo(false);
        }
      }
    },
    [inVideoWithTranscriptProvider, updatePlaybackState, updatePlayVideo],
  );

  const onReady = useCallback(() => {
    // Player is ready — no action needed, autoplay is set via initialPlay prop
  }, []);

  const onError = useCallback((error: string) => {
    console.warn("[YouTubeVideo] Player error:", error);
  }, []);

  // ── Shared style ───────────────────────────────────────────────────────
  const playerStyle = useMemo(
    () => ({
      height,
      width: "100%" as const,
    }),
    [height],
  );

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <YoutubePlayer
      ref={playerRef}
      key={`${youtubeId}-${startTime}`}
      height={height}
      width="100%"
      videoId={youtubeId}
      play={autoplay}
      initialPlayerParams={{
        controls,
        start: startTime,
        modestbranding: true,
        rel: false,
        cc_load_policy: true,
        cc_lang_pref: "us",
      }}
      onChangeState={onStateChange}
      onReady={onReady}
      onError={onError as any}
      webViewStyle={{ opacity: 0.99 }}
    />
  );
};