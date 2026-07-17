// @/components/YouTubeVideo.tsx
// YouTube player using react-native-youtube-iframe.

import { useRef, useEffect, useCallback } from "react";
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
  let currentTime = 0;
  let inVideoWithTranscriptProvider = false;
  let playVideo = autoplay;
  let seekTime: number | undefined;
  let resetSeekTime: () => void = () => {};
  let updatePlaybackState: (state: PLAYER_STATES) => void = () => {};
  let updateDuration: (duration: number) => void = () => {};
  let updatePlayVideo: (isPlaying: boolean) => void = () => {};

  try {
    const context = useVideoWithTranscriptContext();
    currentTime = context.currentTime;
    resetSeekTime = context.resetSeekTime;
    updatePlaybackState = context.updatePlaybackState;
    updateDuration = context.updateDuration;
    playVideo = context.playVideo;
    updatePlayVideo = context.updatePlayVideo;
    inVideoWithTranscriptProvider = true;
    seekTime = context.seekTime;
  } catch (_error) {
    // Not wrapped in a VideoWithTranscriptProvider — operate standalone
  }

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
  // The library sends STRING states ('playing', 'paused', etc.) but the app
  // uses NUMERIC states matching the YouTube IFrame API (1, 2, etc.).
  const onStateChange = useCallback(
    (state: string) => {
      if (!inVideoWithTranscriptProvider) return;
      // Map library string state → numeric PLAYER_STATES
      const stateMap: Record<string, PLAYER_STATES> = {
        playing: PLAYER_STATES.PLAYING,
        paused: PLAYER_STATES.PAUSED,
        ended: PLAYER_STATES.ENDED,
        unstarted: PLAYER_STATES.UNSTARTED,
        buffering: PLAYER_STATES.BUFFERING,
        'video cued': PLAYER_STATES.VIDEO_CUED,
      };
      const mappedState = stateMap[state] ?? PLAYER_STATES.UNSTARTED;
      updatePlaybackState(mappedState);
      if (mappedState === PLAYER_STATES.PLAYING) {
        updatePlayVideo(true);
      } else if (mappedState === PLAYER_STATES.PAUSED || mappedState === PLAYER_STATES.ENDED) {
        updatePlayVideo(false);
      }
    },
    [inVideoWithTranscriptProvider, updatePlaybackState, updatePlayVideo],
  );

  const onReady = useCallback(() => {
    // Player is ready
  }, []);

  const onError = useCallback((error: string) => {
    console.warn("[YouTubeVideo] Player error:", error);
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────
  // react-native-youtube-iframe uses prop-based playback control.
  // The `play` prop responds to context-controlled playVideo state.
  return (
    <YoutubePlayer
      ref={playerRef}
      key={`${youtubeId}-${startTime}`}
      height={height}
      width="100%"
      videoId={youtubeId}
      play={playVideo}
      mute={mute}
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