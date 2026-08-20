import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, ScrollView } from 'react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { useT } from '@/hooks/use-t';
import { apiClient } from '@langplayer/api-client';
import { baseCode } from '@langplayer/utils';
import { PageContainer } from '@/components/layout/PageContainer';
import { ChannelCard, type Channel } from '@/components/video/ChannelCard';

export default function ChannelsScreen() {
  const { l2Lang } = useLanguage();
  const t = useT();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiClient
      .get<Channel[]>('/channels', { params: { l2: baseCode(l2Lang.code) } })
      .then((data) => {
        if (!cancelled) setChannels(Array.isArray(data) ? data : []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [l2Lang.code]);

  return (
    <PageContainer maxWidth="7xl">
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 32 }}>
        <View className="px-4 pt-4 pb-2">
          <Text className="text-3xl font-bold text-foreground">
            {t('msg.channels_for_l2', { l2: l2Lang.name })}
          </Text>
        </View>
        {loading ? (
          <View className="items-center py-20">
            <ActivityIndicator size="large" className="text-primary" />
          </View>
        ) : channels.length === 0 ? (
          <Text className="py-16 text-center text-base text-muted-foreground">
            {t('msg.no_videos_found')}
          </Text>
        ) : (
          <View className="flex-row flex-wrap gap-3 px-4 pt-2">
            {channels.map((channel) => (
              <View key={channel.channel_id} className="w-[48%]">
                <ChannelCard channel={channel} />
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </PageContainer>
  );
}
