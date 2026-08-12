import React from 'react';
import { View, Text, Image, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useT } from '@/hooks/use-t';
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
            source={{
              uri: channel.thumbnail || 'https://www.youtube.com/favicon.ico',
            }}
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
