import React, { useCallback, useRef, useImperativeHandle, forwardRef, useState, useEffect } from 'react';
import { View, ActivityIndicator, Text } from 'react-native';
import YoutubePlayer from 'react-native-youtube-iframe';

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
    // shouldPlay = desired state (controls the `play` prop)
    // playerState = actual YouTube player state (from onChangeState)
    const [shouldPlay, setShouldPlay] = useState(autoplay);
    const [playerState, setPlayerState] = useState<string>('unstarted');
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
        playerRef.current?.setPlaybackRate?.(rate);
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
      // When user interacts with native YouTube controls, sync shouldPlay
      if (state === 'playing') setShouldPlay(true);
      else if (state === 'paused' || state === 'ended') setShouldPlay(false);
    }, [onStateChange]);

    if (error) {
      return (
        <View className="aspect-video w-full items-center justify-center bg-muted p-4">
          <Text className="text-center text-sm text-destructive">{error}</Text>
        </View>
      );
    }

    return (
      <View className="aspect-video w-full bg-black">
        {!ready && (
          <View className="absolute inset-0 items-center justify-center">
            <ActivityIndicator size="large" className="text-white" />
          </View>
        )}
        <YoutubePlayer
          ref={playerRef}
          height={300}
          width={360}
          videoId={youtubeId}
          play={shouldPlay}
          initialPlayerParams={{ start: startTime }}
          onChangeState={handleStateChange}
          onReady={() => { setReady(true); }}
          onError={(e: any) => {
            const msg = typeof e === 'string' ? e : (e?.message ?? e?.error ?? 'Playback error');
            setError(String(msg));
            onError?.(new Error(String(msg)));
          }}
          webViewStyle={{ opacity: ready ? 1 : 0 }}
        />
      </View>
    );
  }
);
