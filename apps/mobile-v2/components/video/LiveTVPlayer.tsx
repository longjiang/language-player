import React, { useCallback, useRef, useImperativeHandle, forwardRef, useState, useEffect } from 'react';
import { View, Text, ActivityIndicator, Pressable, useWindowDimensions } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Play, Pause, Volume2, VolumeX } from 'lucide-react-native';
import type { LiveTVChannel } from '@langplayer/shared';

interface LiveTVPlayerProps {
  channel: LiveTVChannel;
  onError?: (error: string) => void;
}

export interface LiveTVPlayerHandle {
  play: () => void;
  pause: () => void;
  toggleMute: () => void;
}

export const LiveTVPlayer = forwardRef<LiveTVPlayerHandle, LiveTVPlayerProps>(
  function LiveTVPlayer({ channel, onError }, ref) {
    const { width: screenWidth } = useWindowDimensions();
    const videoHeight = (screenWidth / 16) * 9;
    const [muted, setMuted] = useState(false);
    const [isPlaying, setIsPlaying] = useState(true);
    const [buffering, setBuffering] = useState(true);

    const player = useVideoPlayer({ uri: channel.url }, (player) => {
      player.loop = false;
      player.muted = false;
      player.play();
    });

    // Update source when channel changes
    useEffect(() => {
      player.replace({ uri: channel.url });
      player.play();
      setBuffering(true);
    }, [channel.id, channel.url]);

    // Sync muted state
    useEffect(() => {
      player.muted = muted;
    }, [muted, player]);

    // Listen to player events
    useEffect(() => {
      const onPlayingChange = player.addListener('playingChange', (p) => {
        setIsPlaying(p.isPlaying);
      });
      const onStatusChange = player.addListener('statusChange', (p) => {
        setBuffering(p.status === 'loading');
      });
      const onErrorEvent = player.addListener('statusChange', (p) => {
        if (p.status === 'error') {
          onError?.('Playback error');
        }
      });
      return () => {
        onPlayingChange.remove();
        onStatusChange.remove();
        onErrorEvent.remove();
      };
    }, [player, onError]);

    useImperativeHandle(ref, () => ({
      play: () => player.play(),
      pause: () => player.pause(),
      toggleMute: () => setMuted((m) => !m),
    }), [player]);

    if (!channel.url) {
      return (
        <View className="w-full items-center justify-center bg-muted" style={{ height: videoHeight }}>
          <Text className="text-muted-foreground">No stream URL available</Text>
        </View>
      );
    }

    return (
      <View className="relative w-full bg-black" style={{ height: videoHeight }}>
        <VideoView
          player={player}
          style={{ width: '100%', height: '100%' }}
          nativeControls={false}
        />

        {/* Buffering overlay */}
        {buffering && (
          <View className="absolute inset-0 items-center justify-center bg-black/50">
            <ActivityIndicator size="large" color="#fff" />
          </View>
        )}

        {/* Channel name overlay */}
        <View className="absolute left-3 top-3 rounded bg-black/60 px-2.5 py-1">
          <Text className="text-xs font-medium text-white" numberOfLines={1}>
            {channel.name}
          </Text>
        </View>

        {/* Mute button */}
        <Pressable
          onPress={() => setMuted((m) => !m)}
          className="absolute right-3 top-3 rounded-full bg-black/60 p-2"
        >
          {muted ? (
            <VolumeX size={18} color="#fff" />
          ) : (
            <Volume2 size={18} color="#fff" />
          )}
        </Pressable>
      </View>
    );
  }
);
