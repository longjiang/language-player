import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Alert } from 'react-native';
import Toast from 'react-native-toast-message';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useT } from '@/hooks/use-t';
import { apiClient } from '@langplayer/api-client';
import { baseCode } from '@langplayer/utils';
import type { YouTubeVideo } from '@langplayer/shared';
import { PageContainer } from '@/components/layout/PageContainer';
import { VideoGrid } from '@/components/video/VideoGrid';
import { ChannelCard, type Channel } from '@/components/video/ChannelCard';
import { useChannelPreferences } from '@/hooks/use-channel-preferences';
import { Sidebar, useSidebar } from '@/components/ui/sidebar';
import { ICON_MUTED } from '@/lib/theme-colors';
import { AlertCircle, PanelRight, PanelRightClose } from 'lucide-react-native';

type PrefTab = 'subscribed' | 'not_interested';

export default function MyChannelsScreen() {
  const { user } = useAuth();
  const { l2Lang } = useLanguage();
  const t = useT();
  const { subscribed, notInterested, resetSubscribed, resetNotInterested } =
    useChannelPreferences();

  const [channels, setChannels] = useState<Channel[]>([]);
  const [videos, setVideos] = useState<YouTubeVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState<PrefTab>('subscribed');
  const [busy, setBusy] = useState(false);
  const { isWide, sidebarOpen, mobileOpen, setMobileOpen, toggle } = useSidebar();

  const l2Code = baseCode(l2Lang.code);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<Channel[]>('/channels', { params: { l2: l2Code } })
      .then((data) => {
        if (!cancelled) setChannels(Array.isArray(data) ? data : []);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [l2Code]);

  const subscribedIds = subscribed.join(',');
  useEffect(() => {
    if (!user?.id || !subscribedIds) {
      setVideos([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(false);
    apiClient
      .get<YouTubeVideo[]>('/search-videos', {
        params: {
          l2: l2Code,
          channelIds: subscribedIds,
          limit: 100,
          sort: '-date',
        },
      })
      .then((data) => {
        if (!cancelled) setVideos(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [user?.id, subscribedIds, l2Code]);

  const channelById = useMemo(() => {
    const map = new Map<string, Channel>();
    for (const c of channels) map.set(c.channel_id, c);
    return map;
  }, [channels]);

  const tabIds = tab === 'subscribed' ? subscribed : notInterested;
  const tabChannels = tabIds
    .map((id) => channelById.get(id))
    .filter((c): c is Channel => Boolean(c));
  const emptyKey =
    tab === 'subscribed'
      ? 'msg.no_subscribed_channels'
      : 'msg.no_not_interested_channels';

  const handleReset = async () => {
    setBusy(true);
    try {
      if (tab === 'subscribed') {
        await resetSubscribed();
        Toast.show({ type: 'success', text1: t('msg.unsubscribe_all_success') });
      } else {
        await resetNotInterested();
        Toast.show({ type: 'success', text1: t('msg.reset_not_interested_success') });
      }
    } finally {
      setBusy(false);
    }
  };

  const handleResetPress = () => {
    const isSubscribed = tab === 'subscribed';
    Alert.alert(
      isSubscribed ? t('action.unsubscribe_all') : t('action.unmark_all_not_interested'),
      isSubscribed ? t('msg.confirm_unsubscribe_all') : t('msg.confirm_reset_not_interested'),
      [
        { text: t('action.cancel'), style: 'cancel' },
        {
          text: isSubscribed ? t('action.unsubscribe_all') : t('action.unmark_all_not_interested'),
          style: 'destructive',
          onPress: () => void handleReset(),
        },
      ],
    );
  };

  const sidebarContent = (
    <>
      {/* Channel preference tabs */}
      <View className="flex-row border-b border-border">
        {(['subscribed', 'not_interested'] as PrefTab[]).map((key) => (
          <Pressable
            key={key}
            onPress={() => setTab(key)}
            className={`flex-1 items-center border-b-2 px-2 py-2.5 ${
              tab === key ? 'border-primary' : 'border-transparent'
            }`}
          >
            <Text
              className={`text-xs font-medium ${
                tab === key ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              {t(key === 'subscribed' ? 'title.subscribed' : 'title.not_interested')}
            </Text>
          </Pressable>
        ))}
      </View>

      <View className="flex-row items-center justify-between px-3 py-2">
        <Text className="text-xs text-muted-foreground">
          {tabIds.length} {t('msg.channels')}
        </Text>
        {tabIds.length > 0 && (
          <Pressable
            onPress={handleResetPress}
            disabled={busy}
            className="rounded-md border border-border px-3 py-1.5"
          >
            <Text className="text-xs text-muted-foreground">
              {busy
                ? t('msg.loading')
                : tab === 'subscribed'
                  ? t('action.unsubscribe_all')
                  : t('action.unmark_all_not_interested')}
            </Text>
          </Pressable>
        )}
      </View>

      {tabChannels.length === 0 ? (
        <Text className="py-10 text-center text-sm text-muted-foreground">
          {t(emptyKey)}
        </Text>
      ) : (
        <View className="gap-1 px-1 pb-1">
          {tabChannels.map((channel) => (
            <ChannelCard key={channel.channel_id} channel={channel} />
          ))}
        </View>
      )}
    </>
  );

  return (
    <PageContainer maxWidth="7xl">
      <View className="flex-1">
        {/* Header — title + sidebar show/collapse toggle (web parity) */}
        <View className="mb-4 flex-row items-center gap-3 px-4 pt-4">
          <Text className="flex-1 text-2xl font-bold text-foreground">
            {t('title.my_channels')}
          </Text>
          <Pressable
            onPress={toggle}
            className="rounded p-1 active:bg-muted"
            accessibilityRole="button"
            accessibilityLabel={
              isWide
                ? sidebarOpen
                  ? t('action.collapse_sidebar')
                  : t('action.expand_sidebar')
                : t('action.show_sidebar')
            }
          >
            {isWide && sidebarOpen ? (
              <PanelRightClose size={20} color={ICON_MUTED} />
            ) : (
              <PanelRight size={20} color={ICON_MUTED} />
            )}
          </Pressable>
        </View>

        <View className="flex-1 flex-row">
          <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 32 }}>
            {!user?.id ? (
              <Text className="py-16 text-center text-sm text-muted-foreground">
                {t('label.guest_user')}
              </Text>
            ) : error ? (
              <View className="mx-4 mt-4 flex-row items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3">
                <AlertCircle size={16} color="#ef4444" />
                <Text className="text-sm text-destructive">{t('error.failed_to_load')}</Text>
              </View>
            ) : (
              <VideoGrid
                videos={videos}
                loading={loading}
                queueType="recommended"
              />
            )}
            {loading && (
              <View className="py-4">
                <ActivityIndicator size="small" color={ICON_MUTED} />
              </View>
            )}
          </ScrollView>

          {/* Channel preferences sidebar — persistent panel on wide screens,
              slide-in sheet on narrow screens (web parity) */}
          <Sidebar
            open={mobileOpen}
            onOpenChange={setMobileOpen}
            sidebarOpen={sidebarOpen}
            desktopClassName="w-72 ml-3"
          >
            {sidebarContent}
          </Sidebar>
        </View>
      </View>
    </PageContainer>
  );
}
