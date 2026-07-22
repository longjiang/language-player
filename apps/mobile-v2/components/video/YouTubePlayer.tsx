import React, { useCallback, useRef, useImperativeHandle, forwardRef, useState, useEffect } from 'react';
import { View, ActivityIndicator, Text, useWindowDimensions } from 'react-native';
import YoutubePlayer from 'react-native-youtube-iframe';
import { useT } from '@/hooks/use-t';

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
    const playerRef = useRef<any>(null);
    const [ready, setReady] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [shouldPlay, setShouldPlay] = useState(autoplay);
    const shouldPlayRef = useRef(shouldPlay);
    shouldPlayRef.current = shouldPlay;
    const [playerState, setPlayerState] = useState<string>('unstarted');
    const [playbackRate, setPlaybackRateState] = useState(1);
    const t = useT();
    const { width: screenWidth } = useWindowDimensions();
    const videoWidth = screenWidth;
    const videoHeight = (screenWidth / 16) * 9; // 16:9 aspect ratio
    const timeRef = useRef(0);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const onTimeUpdateRef = useRef(onTimeUpdate);
    onTimeUpdateRef.current = onTimeUpdate;

    // Time polling while the video is actually playing
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
        const player = playerRef.current;
        if (player) player.seekTo(seconds, true);
      },
      setPlaybackRate: (rate: number) => {
        setPlaybackRateState(rate);
      },
      getCurrentTime: async () => {
        try {
          const t = await playerRef.current?.getCurrentTime();
          return t ?? timeRef.current;
        } catch {
          return timeRef.current;
        }
      },
    }));

    const handleStateChange = useCallback((state: string) => {
      onStateChange?.(state);
      setPlayerState(state);
      // Sync shouldPlay with actual player state
      if (state === 'playing') setShouldPlay(true);
      else if (state === 'paused' || state === 'ended') setShouldPlay(false);
    }, [onStateChange]);

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
            <ActivityIndicator size="large" className="text-white" />
          </View>
        )}
        <YoutubePlayer
          ref={playerRef}
          height={videoHeight}
          width={videoWidth}
          videoId={youtubeId}
          play={shouldPlay}
          playbackRate={playbackRate}
          initialPlayerParams={{ start: startTime }}
          onChangeState={handleStateChange}
          onReady={() => {
            setReady(true);
            // Workaround: react-native-youtube-iframe's sendPostMessage
            // drops messages if playerReady is false. If the user tapped
            // play before onReady, re-apply the command after a frame.
            if (shouldPlayRef.current) {
              setShouldPlay(false);
              requestAnimationFrame(() => setShouldPlay(true));
            }
          }}
          onError={(e: any) => {
            const msg = typeof e === 'string' ? e : (e?.message ?? e?.error ?? t('msg.playback_error'));
            setError(String(msg));
            onError?.(new Error(String(msg)));
          }}
          webViewStyle={{ opacity: ready ? 1 : 0 }}
        />
      </View>
    );
  }
);
