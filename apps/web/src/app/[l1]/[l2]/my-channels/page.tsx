'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useLanguage } from '@/providers/language-provider';
import { useT } from '@/hooks/use-t';
import { baseCode } from '@/lib/language-data';
import { useChannelPreferences } from '@/hooks/use-channel-preferences';
import { ChannelCard, type Channel } from '@/components/video/channel-card';
import { VideoGrid } from '@/components/video/video-grid';
import { Sidebar } from '@/components/ui/sidebar';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import {
  Loader2,
  MoreVertical,
  PanelRightClose,
  PanelRight,
  AlertCircle,
} from 'lucide-react';
import type { YouTubeVideo } from '@langplayer/shared';

type PrefTab = 'subscribed' | 'not_interested';

export default function MyChannelsPage() {
  const { l2 } = useLanguage();
  const { data: session } = useSession();
  const t = useT();
  const { subscribed, notInterested, resetSubscribed, resetNotInterested } =
    useChannelPreferences();

  const [channels, setChannels] = useState<Channel[]>([]);
  const [videos, setVideos] = useState<YouTubeVideo[]>([]);
  const [videosLoading, setVideosLoading] = useState(false);
  const [videosError, setVideosError] = useState(false);
  const [tab, setTab] = useState<PrefTab>('subscribed');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const l2Code = baseCode(l2.code);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/channels?l2=${encodeURIComponent(l2Code)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) setChannels(data?.channels ?? []);
      })
      .catch(() => {})
    return () => { cancelled = true; };
  }, [l2Code]);

  const subscribedIds = subscribed.join(',');
  useEffect(() => {
    if (!session?.user || !subscribedIds) {
      setVideos([]);
      setVideosLoading(false);
      return;
    }
    let cancelled = false;
    setVideosLoading(true);
    setVideosError(false);
    fetch(
      `/api/videos/subscribed?l2=${encodeURIComponent(l2Code)}` +
        `&channelIds=${encodeURIComponent(subscribedIds)}&limit=100`,
    )
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) setVideos(data?.videos ?? []);
      })
      .catch(() => {
        if (!cancelled) setVideosError(true);
      })
      .finally(() => {
        if (!cancelled) setVideosLoading(false);
      });
    return () => { cancelled = true; };
  }, [session?.user, subscribedIds, l2Code]);

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
      if (tab === 'subscribed') await resetSubscribed();
      else await resetNotInterested();
    } finally {
      setBusy(false);
    }
  };

  const sidebarContent = (
    <div className="flex h-full flex-col">
      <div className="flex border-b border-border">
        {(['subscribed', 'not_interested'] as PrefTab[]).map((key) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 border-b-2 px-2 py-2 text-xs font-medium transition-colors ${
              tab === key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t(key === 'subscribed' ? 'title.subscribed' : 'title.not_interested')}
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-xs text-muted-foreground">
          {tabIds.length} {t('msg.channels')}
        </span>
        {tabIds.length > 0 && (
          <Popover>
            <PopoverTrigger className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
              <MoreVertical className="h-3.5 w-3.5" />
            </PopoverTrigger>
            <PopoverContent side="bottom" align="end" className="w-64 p-1">
              <button
                onClick={() => void handleReset()}
                disabled={busy}
                className="flex w-full items-center rounded-md px-3 py-2 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
              >
                {tab === 'subscribed'
                  ? t('action.unsubscribe_all')
                  : t('action.unmark_all_not_interested')}
              </button>
            </PopoverContent>
          </Popover>
        )}
      </div>
      <div className="flex-1 space-y-1 overflow-y-auto px-1 pb-1">
        {tabChannels.length === 0 ? (
          <p className="px-3 py-4 text-center text-xs text-muted-foreground">
            {t(emptyKey)}
          </p>
        ) : (
          tabChannels.map((channel) => (
            <ChannelCard key={channel.channel_id} channel={channel} />
          ))
        )}
      </div>
    </div>
  );

  return (
    <div className="mx-auto flex h-[calc(100vh-3.5rem)] max-w-7xl flex-col px-4 py-6">
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-3xl font-bold">{t('title.my_channels')}</h1>
        <button
          onClick={() => setMobileOpen(true)}
          className="ml-auto rounded p-1 text-muted-foreground hover:bg-muted lg:hidden"
          aria-label={t('action.show_sidebar')}
        >
          <PanelRight className="h-5 w-5" />
        </button>
        <button
          onClick={() => setSidebarOpen((o) => !o)}
          className="hidden rounded p-1 text-muted-foreground hover:bg-muted lg:block"
          title={sidebarOpen ? t('action.collapse_sidebar') : t('action.expand_sidebar')}
        >
          {sidebarOpen ? <PanelRightClose className="h-5 w-5" /> : <PanelRight className="h-5 w-5" />}
        </button>
      </div>

      <div className="flex min-h-0 flex-1 gap-4">
        <div className="min-w-0 flex-1">
          {!session?.user ? (
            <div className="flex h-full items-center justify-center rounded-xl border border-dashed p-12 text-center">
              <p className="text-muted-foreground">{t('label.guest_user')}</p>
            </div>
          ) : videosLoading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : videosError ? (
            <div className="flex h-full items-center justify-center rounded-xl border border-destructive/30 p-12 text-center">
              <AlertCircle className="h-8 w-8 text-destructive" />
              <p className="mt-2 text-muted-foreground">{t('error.failed_to_load')}</p>
            </div>
          ) : (
            <div className="h-full overflow-y-auto pr-1">
              <VideoGrid videos={videos} queueType="recommended" />
            </div>
          )}
        </div>

        <Sidebar
          open={mobileOpen}
          onOpenChange={setMobileOpen}
          sidebarOpen={sidebarOpen}
          title={t('title.my_channels')}
          desktopClassName="w-72 ml-3"
        >
          {sidebarContent}
        </Sidebar>
      </div>
    </div>
  );
}
