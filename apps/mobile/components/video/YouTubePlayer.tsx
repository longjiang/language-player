import React, { useCallback, useRef, useImperativeHandle, forwardRef, useState, useEffect } from 'react';
import { View, ActivityIndicator, Text, useWindowDimensions } from 'react-native';
import YoutubePlayer, { type YoutubeIframeRef } from 'react-native-youtube-iframe';
import { ICON_ON_PRIMARY } from '@/lib/theme-colors';
import { useT } from '@/hooks/use-t';

/**
 * YouTube player wrapper using react-native-youtube-iframe v2.3.0.
 *
 * ## What works
 * - onReady fires correctly when the YouTube iframe loads
 * - onChangeState fires when YouTube's native play/pause button is tapped
 * - seekTo works (uses injectJavaScript directly, bypassing postMessage)
 * - Subtitles render, time polling works when onChangeState reports 'playing'
 * - Video metadata loads (getById API)
 *
 * ## What DOESN'T work (iOS)
 * Programmatic play/pause via the `play` prop is broken on iOS. The
 * library's sendPostMessage doesn't reach the YouTube iframe postMessage
 * handler. Tapping the YouTube iframe directly DOES start playback.
 *
 * ## Design decision
 * The `play` prop is set to `undefined` (no control). Users tap the
 * YouTube iframe directly to play/pause. The imperative `play()`/`pause()`
 * methods exposed via ref are no-ops for iOS, and are preserved only to
 * avoid breaking callers that call them via optional chaining.
 *
 * seekTo, setPlaybackRate, and getCurrentTime work on both platforms.
 */

interface YouTubePlayerProps {
  youtubeId: string;
  startTime?: number;
  onTimeUpdate?: (time: number) => void;
  onDuration?: (duration: number) => void;
  onStateChange?: (state: string) => void;
  onError?: (error: Error) => void;
  /** Width of the parent container. When provided, overrides useWindowDimensions to prevent overflow. */
  containerWidth?: number;
}

export interface YouTubePlayerHandle {
  play: () => void;
  pause: () => void;
  seekTo: (seconds: number) => void;
  setPlaybackRate: (rate: number) => void;
  getCurrentTime: () => Promise<number>;
}

export const YouTubePlayer = forwardRef<YouTubePlayerHandle, YouTubePlayerProps>(
  function YouTubePlayer({ youtubeId, startTime, onTimeUpdate, onDuration, onStateChange, onError, containerWidth }, ref) {
    const playerRef = useRef<YoutubeIframeRef>(null);
    const [ready, setReady] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [playerState, setPlayerState] = useState<string>('unstarted');
    const [playbackRate, setPlaybackRateState] = useState(1);
    const t = useT();
    const { width: screenWidth } = useWindowDimensions();
    const playerWidth = containerWidth ?? screenWidth;
    const videoHeight = (playerWidth / 16) * 9;
    const timeRef = useRef(0);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Stable callback refs to avoid re-rendering the player
    const onTimeUpdateRef = useRef(onTimeUpdate);
    onTimeUpdateRef.current = onTimeUpdate;
    const onStateChangeRef = useRef(onStateChange);
    onStateChangeRef.current = onStateChange;

    // Time polling while playing or paused (to catch seeks)
    useEffect(() => {
      pollRef.current = setInterval(async () => {
        try {
          const t = await playerRef.current?.getCurrentTime();
          if (t != null) { timeRef.current = t; onTimeUpdateRef.current?.(t); }
        } catch {}
      }, 500);
      return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
    }, []);

    useImperativeHandle(ref, () => ({
      // No-op on iOS — programmatic play/pause doesn't reach the YouTube
      // iframe. Users tap the embedded player directly.
      play: () => {},
      pause: () => {},
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

    const handleStateChange = useCallback((state: string) => {
      onStateChangeRef.current?.(state);
      setPlayerState(state);
    }, []);

    if (error) {
      return (
        <View style={{ width: playerWidth, height: videoHeight }} className="items-center justify-center bg-muted p-4">
          <Text className="text-center text-sm text-destructive">{error}</Text>
        </View>
      );
    }

    return (
      <View className="w-full bg-black" style={{ height: videoHeight }}>
        {!ready && (
          <View className="absolute inset-0 items-center justify-center">
            <ActivityIndicator size="large" color={ICON_ON_PRIMARY} />
          </View>
        )}
        <YoutubePlayer
          ref={playerRef}
          height={videoHeight}
          width={playerWidth}
          videoId={youtubeId}
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
