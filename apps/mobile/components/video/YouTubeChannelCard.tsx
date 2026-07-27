import React, { useEffect, useState } from 'react';
import { View, Text, Image, Pressable, Linking } from 'react-native';
import { router } from 'expo-router';
import { useLanguage } from '@/contexts/LanguageContext';
import { PYTHON_API_URL } from '@/lib/api-url';
import { ICON_MUTED } from '@/lib/theme-colors';
import { ExternalLink, Loader2 } from 'lucide-react-native';
import { ChannelActionsMenu } from './ChannelActionsMenu';

interface ChannelInfo {
  title: string;
  thumbnail: string;
}

interface YouTubeChannelCardProps {
  channelId: string;
}

export function YouTubeChannelCard({ channelId }: YouTubeChannelCardProps) {
  const { l1Lang, l2Lang } = useLanguage();
  const [channel, setChannel] = useState<ChannelInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!channelId) return;
    let cancelled = false;
    setLoading(true);

    fetch(`${PYTHON_API_URL}/channel-info?channel_id=${channelId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.title) setChannel(data);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [channelId]);

  if (loading) {
    return (
      <View className="flex-row items-center gap-2 rounded-lg border border-border px-3 py-2">
        <Loader2 size={16} color={ICON_MUTED} />
        <Text className="text-xs text-muted-foreground">Loading channel...</Text>
      </View>
    );
  }

  if (!channel) return null;

  return (
    <View className="flex-row items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
      <Pressable
        onPress={() =>
          router.push(
            `/(tabs)/(media)/channel/${encodeURIComponent(channelId)}` as any,
          )
        }
      >
        <Image
          source={{
            uri: channel.thumbnail || 'https://www.youtube.com/favicon.ico',
          }}
          className="h-10 w-10 rounded-full"
        />
      </Pressable>
      <View className="flex-1 min-w-0">
        <Pressable
          onPress={() =>
            router.push(
              `/(tabs)/(media)/channel/${encodeURIComponent(channelId)}` as any,
            )
          }
        >
          <Text className="text-sm font-medium text-foreground" numberOfLines={1}>
            {channel.title}
          </Text>
        </Pressable>
      </View>
      <Pressable
        onPress={() =>
          Linking.openURL(`https://www.youtube.com/channel/${channelId}`)
        }
        className="p-1"
      >
        <ExternalLink size={16} color={ICON_MUTED} />
      </Pressable>
      <ChannelActionsMenu channelId={channelId} />
    </View>
  );
}
