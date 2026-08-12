'use client';

import { useEffect, useState } from 'react';
import { useLanguage } from '@/providers/language-provider';
import { useT } from '@/hooks/use-t';
import { languageName, baseCode } from '@/lib/language-data';
import { ChannelCard, type Channel } from '@/components/video/channel-card';
import { Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function ChannelsPage() {
  const { l1, l2 } = useLanguage();
  const t = useT();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetch(`/api/channels?l2=${encodeURIComponent(baseCode(l2.code))}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        setChannels(data?.channels ?? []);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [l2.code]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">
          {t('msg.channels_for_l2', { l2: languageName(l2.code, l1.code) })}
        </h1>
        <p className="mt-1 text-muted-foreground">{t('title.channels')}</p>
      </div>

      {loading && (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {error && (
        <div className="flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed border-destructive/30 p-12 text-center">
          <AlertCircle className="h-10 w-10 text-destructive" />
          <p className="text-muted-foreground">{t('error.failed_to_load')}</p>
          <Button variant="outline" onClick={() => window.location.reload()}>
            {t('action.try_again')}
          </Button>
        </div>
      )}

      {!loading && !error && channels.length === 0 && (
        <div className="rounded-2xl border-2 border-dashed border-border p-12 text-center">
          <p className="text-muted-foreground">{t('msg.no_videos_found')}</p>
        </div>
      )}

      {!loading && !error && channels.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {channels.map((channel) => (
            <ChannelCard key={channel.channel_id} channel={channel} />
          ))}
        </div>
      )}
    </div>
  );
}
