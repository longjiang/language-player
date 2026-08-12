import React, { useState } from 'react';
import { View, Text, Image, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useT } from '@/hooks/use-t';
import { PYTHON_API_URL } from '@/lib/api-url';
import { ChannelActionsMenu } from './ChannelActionsMenu';

export interface Channel {
  id?: string | number;
  channel_id: string;
  thumbnail?: string | null;
  title?: string | null;
  subscribers?: number | null;
  video_count?: number | null;
}

function formatCount(value: number | null | undefined): string {
  if (!value) return '';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

export function ChannelCard({ channel }: { channel: Channel }) {
  const t = useT();
  const [avatarError, setAvatarError] = useState(false);
  // Classic polyfills avatars through /channel-thumbnail (fresh from YouTube,
  // cached server-side) instead of trusting the DB thumbnail (SPEC-072).
  const avatarSrc = avatarError
    ? 'https://www.youtube.com/favicon.ico'
    : `${PYTHON_API_URL}/channel-thumbnail?channel_id=${encodeURIComponent(channel.channel_id)}`;

  return (
    <View className="rounded-lg border border-border bg-card p-3">
      <Pressable
        onPress={() =>
          router.push(
            `/(tabs)/(media)/channel/${encodeURIComponent(channel.channel_id)}` as any,
          )
        }
      >
        <View className="flex-row items-center gap-3">
          <Image
            source={{ uri: avatarSrc }}
            onError={() => setAvatarError(true)}
            className="h-12 w-12 rounded-full"
          />
          <View className="flex-1">
            <Text className="text-sm font-medium text-foreground" numberOfLines={2}>
              {channel.title ?? '—'}
            </Text>
            {(channel.subscribers != null || channel.video_count != null) && (
              <Text className="mt-0.5 text-xs text-muted-foreground">
                {channel.subscribers != null
                  ? `${formatCount(channel.subscribers)} ${t('label.subscribers')}`
                  : ''}
                {channel.subscribers != null && channel.video_count != null
                  ? ' · '
                  : ''}
                {channel.video_count != null
                  ? `${formatCount(channel.video_count)} ${t('label.videos')}`
                  : ''}
              </Text>
            )}
          </View>
        </View>
      </Pressable>
      <View className="absolute right-2 top-2">
        <ChannelActionsMenu channelId={channel.channel_id} />
      </View>
    </View>
  );
}
