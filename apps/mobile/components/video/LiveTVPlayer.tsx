import React, { useCallback, useRef, useImperativeHandle, forwardRef, useState, useEffect } from 'react';
import { View, Text, ActivityIndicator, Pressable, useWindowDimensions } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useIsFocused } from 'expo-router';
import { Play, Pause, Volume2, VolumeX } from 'lucide-react-native';
import { ICON_ON_PRIMARY } from '@/lib/theme-colors';
import { useT } from '@/hooks/use-t';
import type { LiveTVChannel } from '@langplayer/shared';

interface LiveTVPlayerProps {
  channel: LiveTVChannel;
  onError?: (error: string) => void;
  /** Width of the parent container. When provided, overrides useWindowDimensions to prevent overflow. */
  containerWidth?: number;
}

export interface LiveTVPlayerHandle {
  play: () => void;
  pause: () => void;
  toggleMute: () => void;
}

export const LiveTVPlayer = forwardRef<LiveTVPlayerHandle, LiveTVPlayerProps>(
  function LiveTVPlayer({ channel, onError, containerWidth }, ref) {
    const t = useT();
    const isFocused = useIsFocused();
    const { width: screenWidth } = useWindowDimensions();
    const playerWidth = containerWidth ?? screenWidth;
    const videoHeight = (playerWidth / 16) * 9;
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
      // replaceAsync avoids loading the asset synchronously on the main
      // thread (the sync `replace` is deprecated and freezes the UI).
      void player.replaceAsync({ uri: channel.url }).catch(() => {});
      player.play();
      setBuffering(true);
    }, [channel.id, channel.url]);

    // Stop the stream when the user navigates away from Live TV; resume it
    // when they come back (the screen can stay mounted in the stack).
    useEffect(() => {
      if (isFocused) {
        player.play();
      } else {
        player.pause();
      }
    }, [isFocused, player]);

    // Make sure the stream is stopped if the player is ever unmounted.
    useEffect(() => {
      return () => {
        try {
          player.pause();
        } catch {
          // useVideoPlayer releases the native player during unmount; by the
          // time this cleanup runs the shared object may already be gone.
        }
      };
    }, [player]);

    // Sync muted state
    useEffect(() => {
      player.muted = muted;
    }, [muted, player]);

    // Listen to player events
    useEffect(() => {
      const onPlayingChange = player.addListener('playingChange', (p) => {
        setIsPlaying(p.isPlaying);
        // Live streams can emit a ready/playing status without a matching
        // statusChange after loading; clear the spinner as soon as playback
        // actually starts so it never stays visible on a playing stream.
        if (p.isPlaying) setBuffering(false);
      });
      const onStatusChange = player.addListener('statusChange', (p) => {
        setBuffering(p.status === 'loading');
        if (p.status === 'error') {
          onError?.('Playback error');
        }
      });
      return () => {
        onPlayingChange.remove();
        onStatusChange.remove();
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
          <Text className="text-muted-foreground">{t('msg.no_stream_url_available')}</Text>
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
            <ActivityIndicator size="large" color={ICON_ON_PRIMARY} />
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
            <VolumeX size={18} color={ICON_ON_PRIMARY} />
          ) : (
            <Volume2 size={18} color={ICON_ON_PRIMARY} />
          )}
        </Pressable>
      </View>
    );
  }
);
