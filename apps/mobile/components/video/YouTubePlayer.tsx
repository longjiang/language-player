import React, { useCallback, useRef, useImperativeHandle, forwardRef, useState, useEffect } from 'react';
import { View, ActivityIndicator, Text, Linking, useWindowDimensions } from 'react-native';
import { Pressable } from '@/components/ui/pressable';
import YoutubePlayer, { type YoutubeIframeRef } from 'react-native-youtube-iframe';
import { ICON_ON_PRIMARY } from '@/lib/theme-colors';
import { useT } from '@/hooks/use-t';
import { log } from '@/lib/logger';

// react-native-youtube-iframe reports errors as PLAYER_ERROR names, and web's
// player maps numeric IFrame codes. Keep both mappings so every known error
// shows a localized message instead of a raw English string.
const YOUTUBE_ERROR_KEYS: Record<string, string> = {
  invalid_parameter: 'msg.youtube_error_invalid_id',
  HTML5_error: 'msg.youtube_error_html5',
  video_not_found: 'msg.youtube_error_invalid_id',
  embed_not_allowed: 'msg.youtube_error_embed_disabled',
  '2': 'msg.youtube_error_invalid_id',
  '5': 'msg.youtube_error_html5',
  '100': 'msg.youtube_error_invalid_id',
  '101': 'msg.youtube_error_embed_disabled',
  '150': 'msg.youtube_error_embed_disabled',
};

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
  /** Start playback automatically once the player is ready (default: false). */
  autoplay?: boolean;
  startTime?: number;
  onTimeUpdate?: (time: number) => void;
  onDuration?: (duration: number) => void;
  onStateChange?: (state: string) => void;
  onError?: (error: Error, info?: { messageKey: string; skippable: boolean }) => void;
  /** Width of the parent container. When provided, overrides useWindowDimensions to prevent overflow. */
  containerWidth?: number;
  /** Native aspect ratio (width ÷ height) of the video content, from YouTube
   *  metadata (e.g. ~1.778 for 16:9, ~1.333 for 4:3). Defaults to 16:9. When
   *  combined with `availableHeight`, the player contain-fits to its column so
   *  non-16:9 videos render larger without pillarboxing (SPEC-010 wide). */
  aspectRatio?: number;
  /** Max height (px) the player may occupy — the visible part of the column.
   *  When set (with `aspectRatio`), the player is contained rather than
   *  stretched to the column's full width. */
  availableHeight?: number;
}

export interface YouTubePlayerHandle {
  play: () => void;
  pause: () => void;
  seekTo: (seconds: number) => void;
  setPlaybackRate: (rate: number) => void;
  getCurrentTime: () => Promise<number>;
}

export const YouTubePlayer = forwardRef<YouTubePlayerHandle, YouTubePlayerProps>(
  function YouTubePlayer({ youtubeId, autoplay = false, startTime, onTimeUpdate, onDuration, onStateChange, onError, containerWidth, aspectRatio, availableHeight }, ref) {
    const playerRef = useRef<YoutubeIframeRef>(null);
    const [ready, setReady] = useState(false);
    const [errorKey, setErrorKey] = useState<string | null>(null);
    const [playerState, setPlayerState] = useState<string>('unstarted');
    const [playbackRate, setPlaybackRateState] = useState(1);
    const t = useT();
    const { width: screenWidth } = useWindowDimensions();
    const playerWidth = containerWidth ?? screenWidth;
    // SPEC-010 wide layout: contain-fit to the available height using the
    // video's native aspect ratio. Defaults to 16:9 (matches prior behaviour).
    const AR = aspectRatio && aspectRatio > 0 ? aspectRatio : 16 / 9;
    const availH = availableHeight && availableHeight > 0 ? availableHeight : null;
    const videoWidth = availH ? Math.min(playerWidth, availH * AR) : playerWidth;
    const videoHeight = videoWidth / AR;

    // Aspect-ratio trace: log the contain-fit inputs and result so the
    // server-to-layout flow can be confirmed end-to-end (enable verbose logging).
    useEffect(() => {
      log('[aspectRatio] mobile layout', {
        aspectRatio,
        availableHeight,
        playerWidth,
        AR,
        videoWidth,
        videoHeight,
      });
    }, [aspectRatio, availableHeight, playerWidth, AR, videoWidth, videoHeight]);
    const timeRef = useRef(0);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const pollInFlightRef = useRef(false);
    const previousYoutubeIdRef = useRef(youtubeId);

    // On every video switch: log the change, and clear a previous video's
    // error. Without this the error UI stays mounted forever and every
    // subsequent video shows the old failure (the player is never rebuilt).
    useEffect(() => {
      if (previousYoutubeIdRef.current === youtubeId) return;
      const prev = previousYoutubeIdRef.current;
      previousYoutubeIdRef.current = youtubeId;
      log('[youtube-player] video id changed', {
        prev,
        next: youtubeId,
        errorKey: errorKey ?? null,
      });
      if (errorKey) {
        log('[youtube-player] clearing stale error', { prev, next: youtubeId, errorKey });
        setErrorKey(null);
        setReady(false);
      }
    }, [youtubeId, errorKey]);

    // Stable callback refs to avoid re-rendering the player
    const onTimeUpdateRef = useRef(onTimeUpdate);
    onTimeUpdateRef.current = onTimeUpdate;
    const onStateChangeRef = useRef(onStateChange);
    onStateChangeRef.current = onStateChange;

    // Cue to the requested startTime once the player is ready.
    // `initialPlayerParams.start` is reliable only on the very first load and is
    // treated as an integer; on a video change (prev/next in the subs-search
    // player) or for a fractional start time it can be missed, leaving the
    // video at 0 instead of the matched line. web applies the same seek in
    // `onReady` (ARCH-004 §YouTube Player Integration) — mirror it here, once
    // per (video, startTime). No-op when no startTime, or startTime is 0.
    // Keyed on the (youtubeId, startTime) PAIR (not a monotonically stored
    // string): navigating next → prev back to an already-seen video has a
    // different pair, so the seek fires again instead of being skipped.
    const lastSeekRef = useRef<{ youtubeId: string; startTime: number } | null>(null);
    useEffect(() => {
      if (!ready || startTime == null || startTime < 0) return;
      if (lastSeekRef.current?.youtubeId === youtubeId && lastSeekRef.current?.startTime === startTime) return;
      lastSeekRef.current = { youtubeId, startTime };
      log('[youtube-player] cue seek', { youtubeId, startTime });
      playerRef.current?.seekTo(startTime, true);
    }, [ready, startTime, youtubeId]);

    // Time polling while playing or paused (to catch seeks).
    // Only polls once the iframe is ready: react-native-youtube-iframe adds an
    // internal 'getCurrentTime' listener per call, and calls before the iframe
    // responds never resolve — unbounded polling leaks listeners and triggers
    // the MaxListenersExceededWarning. The in-flight guard caps that to one
    // outstanding call at a time.
    useEffect(() => {
      if (!ready) return;
      pollRef.current = setInterval(async () => {
        if (pollInFlightRef.current) return;
        pollInFlightRef.current = true;
        try {
          const t = await playerRef.current?.getCurrentTime();
          if (t != null) { timeRef.current = t; onTimeUpdateRef.current?.(t); }
        } catch {}
        finally {
          pollInFlightRef.current = false;
        }
      }, 500);
      return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
    }, [ready]);

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

    if (errorKey) {
      const embedBlocked = errorKey === 'msg.youtube_error_embed_disabled';
      return (
        <View
          className="items-center justify-center gap-2 bg-muted p-4"
          style={{ width: videoWidth, height: videoHeight, alignSelf: availH ? 'center' : undefined }}
        >
          <Text className="text-center text-sm text-muted-foreground">{t(errorKey)}</Text>
          {embedBlocked && (
            <Pressable
              onPress={() => Linking.openURL(`https://www.youtube.com/watch?v=${youtubeId}`)}
            >
              <Text className="text-xs font-medium text-primary">{t('action.view_on_youtube')} ↗</Text>
            </Pressable>
          )}
        </View>
      );
    }

    const handlePlayerError = (e: any) => {
      const raw =
        typeof e === 'string'
          ? e
          : (e?.error ?? e?.message ?? e?.nativeEvent?.description ?? '');
      const key = YOUTUBE_ERROR_KEYS[String(raw)] ?? 'msg.youtube_error_generic';
      // Every known mapping is a fatal load/embed failure that is safe to
      // auto-skip in a result list; only the generic fallback stays manual.
      const skippable = key !== 'msg.youtube_error_generic';
      log('[youtube-player] player error', {
        youtubeId,
        raw: String(raw),
        key,
        skippable,
      });
      setErrorKey(key);
      onError?.(new Error(t(key)), { messageKey: key, skippable });
    };

    return (
      <View
        className={`bg-black ${availH ? '' : 'w-full'}`}
        style={{ width: videoWidth, height: videoHeight, alignSelf: availH ? 'center' : undefined }}
      >
        {!ready && (
          <View className="absolute inset-0 items-center justify-center">
            <ActivityIndicator size="large" color={ICON_ON_PRIMARY} />
          </View>
        )}
        <YoutubePlayer
          ref={playerRef}
          play={autoplay}
          height={videoHeight}
          width={videoWidth}
          videoId={youtubeId}
          playbackRate={playbackRate}
          // Let YouTube render its own progress bar, captions, settings,
          // fullscreen, and the rest of the standard player controls.
          initialPlayerParams={{ start: startTime, controls: true }}
          webViewProps={{
            allowsInlineMediaPlayback: true,
            allowsFullscreenVideo: true,
            mediaPlaybackRequiresUserAction: false,
            onError: handlePlayerError,
          }}
          onChangeState={handleStateChange}
          onReady={() => setReady(true)}
          onError={handlePlayerError}
          webViewStyle={{ opacity: ready ? 1 : 0.99 }}
        />
      </View>
    );
  }
);
