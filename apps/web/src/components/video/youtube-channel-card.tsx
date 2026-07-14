'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/providers/language-provider';
import { PYTHON_API_URL } from '@/lib/api-url';
import { ChannelActionsMenu } from './channel-actions-menu';
import { Loader2, ExternalLink } from 'lucide-react';

interface ChannelInfo {
  title: string;
  thumbnail: string;
}

interface ChannelCardProps {
  channelId: string;
}

export function YouTubeChannelCard({ channelId }: ChannelCardProps) {
  const { l1, l2 } = useLanguage();
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
      <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading channel...
      </div>
    );
  }

  if (!channel) return null;

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
      <Link
        href={`/${l1.code}/${l2.code}/channel/${encodeURIComponent(channelId)}`}
        className="flex-shrink-0"
      >
        <img
          src={channel.thumbnail || `https://www.youtube.com/favicon.ico`}
          alt=""
          className="h-10 w-10 rounded-full object-cover"
        />
      </Link>
      <div className="min-w-0 flex-1">
        <Link
          href={`/${l1.code}/${l2.code}/channel/${encodeURIComponent(channelId)}`}
          className="text-sm font-medium hover:text-primary transition-colors line-clamp-1"
        >
          {channel.title}
        </Link>
      </div>
      <a
        href={`https://www.youtube.com/channel/${channelId}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
        title="View on YouTube"
      >
        <ExternalLink className="h-4 w-4" />
      </a>
      <ChannelActionsMenu channelId={channelId} />
    </div>
  );
}
