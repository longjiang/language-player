import React, { useCallback, useRef, useImperativeHandle, forwardRef, useState, useEffect } from 'react';
import { View, ActivityIndicator, Text, useWindowDimensions } from 'react-native';
import YoutubePlayer, { type YoutubeIframeRef } from 'react-native-youtube-iframe';
import { useT } from '@/hooks/use-t';

/**
 * YouTube player wrapper using react-native-youtube-iframe v2.3.0.
 *
 * ## How play/pause works (per official docs)
 * The `play` prop (boolean) controls playback declaratively. There are NO
 * imperative playVideo()/pauseVideo() methods on the ref — those were removed
 * in v2.x. The ref only exposes: seekTo, getCurrentTime, getDuration,
 * getPlaybackRate, getVolume, isMuted, getAvailablePlaybackRates.
 *
 * ## What works
 * - onReady fires correctly when the YouTube iframe loads
 * - onChangeState fires when YouTube's NATIVE play button is tapped
 *   (confirmed via idb ui tap on the simulator)
 * - seekTo works (uses injectJavaScript directly, bypassing postMessage)
 * - Subtitles render, time polling works when onChangeState reports 'playing'
 * - Video metadata loads (getById API)
 *
 * ## What DOESN'T work (as of 2026-07-22)
 * - The `play` prop change does NOT start/pause the video on iOS Simulator.
 *   The library's internal sendPostMessage drops playVideo/pauseVideo commands
 *   if playerReady is false, but even when onReady has already fired and
 *   playerReady is true, the postMessage doesn't reach the YouTube iframe.
 *
 * ## Approaches tried (none resolved the issue)
 * 1. Declarative `play` prop + onChangeState sync — current approach, per docs
 * 2. Deferred play: call setShouldPlay(false) then setShouldPlay(true) after
 *    onReady to "re-apply" the play command — didn't work
 * 3. requestAnimationFrame wrapping to defer state updates outside render —
 *    fixed "Cannot update component while rendering" error but play still fails
 * 4. Key remount (increment playKey to force WebView remount with play=true) —
 *    caused full WebView reload on every toggle, and reference errors
 * 5. useLocalHTML prop — no effect
 * 6. webViewProps.mediaPlaybackRequiresUserAction=false — no effect
 * 7. initialPlayerParams.controls=false — hides YT native UI, doesn't fix play
 *
 * ## Likely root cause
 * The library's sendPostMessage sends commands via WebView postMessage.
 * On iOS, the message may not reach the YouTube iframe, or the iframe
 * ignores programmatic play without a direct user gesture inside the WebView.
 * The idb tap (through simulator accessibility layer directly to the WebView)
 * DOES start playback — confirming the iframe works but only responds to
 * in-WebView interaction.
 *
 * ## Next steps
 * - Try hosting iframe.html locally (baseUrlOverride) to debug postMessage
 * - Consider upgrading react-native-youtube-iframe or trying an alternative
 * - The GO app (language-player-3) uses same library v2.3.0 and play works
 *   there — diff their full setup for clues
 */

interface YouTubePlayerProps {
  youtubeId: string;
  autoplay?: boolean;
  startTime?: number;
  onTimeUpdate?: (time: number) => void;
  onDuration?: (duration: number) => void;
  onStateChange?: (state: string) => void;
  onError?: (error: Error) => void;
}

export interface YouTubePlayerHandle {
  play: () => void;
  pause: () => void;
  seekTo: (seconds: number) => void;
  setPlaybackRate: (rate: number) => void;
  getCurrentTime: () => Promise<number>;
}

export const YouTubePlayer = forwardRef<YouTubePlayerHandle, YouTubePlayerProps>(
  function YouTubePlayer({ youtubeId, autoplay = false, startTime, onTimeUpdate, onDuration, onStateChange, onError }, ref) {
    const playerRef = useRef<YoutubeIframeRef>(null);
    const [ready, setReady] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [shouldPlay, setShouldPlay] = useState(autoplay);
    const [playerState, setPlayerState] = useState<string>('unstarted');
    const [playbackRate, setPlaybackRateState] = useState(1);
    const t = useT();
    const { width: screenWidth } = useWindowDimensions();
    const videoHeight = (screenWidth / 16) * 9;
    const timeRef = useRef(0);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Stable callback refs to avoid re-rendering the player
    const onTimeUpdateRef = useRef(onTimeUpdate);
    onTimeUpdateRef.current = onTimeUpdate;
    const onStateChangeRef = useRef(onStateChange);
    onStateChangeRef.current = onStateChange;

    // Time polling while playing
    useEffect(() => {
      if (playerState === 'playing') {
        pollRef.current = setInterval(async () => {
          try {
            const t = await playerRef.current?.getCurrentTime();
            if (t != null) { timeRef.current = t; onTimeUpdateRef.current?.(t); }
          } catch {}
        }, 500);
        return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
      }
    }, [playerState]);

    useImperativeHandle(ref, () => ({
      play: () => setShouldPlay(true),
      pause: () => setShouldPlay(false),
      seekTo: (seconds: number) => {
        playerRef.current?.seekTo(seconds, true);
      },
      setPlaybackRate: (rate: number) => {
        setPlaybackRateState(rate);
      },
      getCurrentTime: async () => {
        try {
          return await playerRef.current?.getCurrentTime() ?? timeRef.current;
        } catch {
          return timeRef.current;
        }
      },
    }), []);

    // Sync shouldPlay with actual player state from YouTube
    const handleStateChange = useCallback((state: string) => {
      onStateChangeRef.current?.(state);
      setPlayerState(state);
      if (state === 'playing') setShouldPlay(true);
      else if (state === 'paused' || state === 'ended') setShouldPlay(false);
    }, []);

    if (error) {
      return (
        <View className="w-full items-center justify-center bg-muted p-4" style={{ height: videoHeight }}>
          <Text className="text-center text-sm text-destructive">{error}</Text>
        </View>
      );
    }

    return (
      <View className="w-full bg-black" style={{ height: videoHeight }}>
        {!ready && (
          <View className="absolute inset-0 items-center justify-center">
            <ActivityIndicator size="large" color="#fff" />
          </View>
        )}
        <YoutubePlayer
          ref={playerRef}
          height={videoHeight}
          width={screenWidth}
          videoId={youtubeId}
          play={shouldPlay}
          playbackRate={playbackRate}
          initialPlayerParams={{ start: startTime, controls: false }}
          webViewProps={{
            allowsInlineMediaPlayback: true,
            allowsFullscreenVideo: true,
            mediaPlaybackRequiresUserAction: false,
          }}
          onChangeState={handleStateChange}
          onReady={() => setReady(true)}
          onError={(e: any) => {
            const msg = typeof e === 'string' ? e : (e?.message ?? e?.error ?? t('msg.playback_error'));
            setError(String(msg));
            onError?.(new Error(String(msg)));
          }}
          webViewStyle={{ opacity: ready ? 1 : 0.99 }}
        />
      </View>
    );
  }
);
