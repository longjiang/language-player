import React, { useCallback, useRef, useImperativeHandle, forwardRef, useState } from 'react';
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
    const timeRef = useRef(0);

    useImperativeHandle(ref, () => ({
      play: () => playerRef.current?.getPlayerState().then((s: string) => { if (s !== 'playing') playerRef.current?.playVideo(); }),
      pause: () => playerRef.current?.pauseVideo(),
      seekTo: (seconds: number) => playerRef.current?.seekTo(seconds, true),
      setPlaybackRate: (rate: number) => playerRef.current?.setPlaybackRate?.(rate),
      getCurrentTime: async () => {
        const t = await playerRef.current?.getCurrentTime();
        return t ?? timeRef.current;
      },
    }));

    const handleStateChange = useCallback((state: string) => {
      onStateChange?.(state);
      if (state === 'playing') {
        // Start time polling
        const poll = setInterval(async () => {
          try {
            const t = await playerRef.current?.getCurrentTime();
            if (t != null) { timeRef.current = t; onTimeUpdate?.(t); }
          } catch {}
        }, 500);
        return () => clearInterval(poll);
      }
    }, [onTimeUpdate, onStateChange]);

    if (error) {
      return (
        <View className="aspect-video w-full items-center justify-center bg-muted">
          <Text className="text-destructive">{error}</Text>
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
          play={autoplay}
          initialPlayerParams={{ start: startTime }}
          onChangeState={handleStateChange}
          onReady={() => { setReady(true); }}
          onError={(e: any) => setError(e ?? 'Playback error')}
          webViewStyle={{ opacity: ready ? 1 : 0 }}
        />
      </View>
    );
  }
);
