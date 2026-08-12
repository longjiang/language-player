'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/providers/language-provider';
import { useT } from '@/hooks/use-t';
import { PYTHON_API_URL } from '@/lib/api-url';
import { ChannelActionsMenu } from './channel-actions-menu';

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
  return new Intl.NumberFormat(undefined, {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

export function ChannelCard({ channel }: { channel: Channel }) {
  const { l1, l2 } = useLanguage();
  const t = useT();
  const [avatarError, setAvatarError] = useState(false);
  const href = `/${l1.code}/${l2.code}/channel/${encodeURIComponent(channel.channel_id)}`;
  // Classic polyfills avatars through /channel-thumbnail (fresh from YouTube,
  // cached server-side) instead of trusting the DB thumbnail, which can go
  // stale/broken (SPEC-072).
  const avatarSrc = avatarError
    ? 'https://www.youtube.com/favicon.ico'
    : `${PYTHON_API_URL}/channel-thumbnail?channel_id=${encodeURIComponent(channel.channel_id)}`;

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-all hover:border-primary/30 hover:shadow-lg">
      <Link href={href} className="flex flex-col p-4">
        <div className="mb-3 flex items-center gap-3">
          <img
            src={avatarSrc}
            onError={() => setAvatarError(true)}
            alt=""
            className="h-14 w-14 rounded-full object-cover"
          />
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-sm font-medium group-hover:text-primary">
              {channel.title ?? '—'}
            </p>
            {(channel.subscribers != null || channel.video_count != null) && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {channel.subscribers != null
                  ? `${formatCount(channel.subscribers)} ${t('label.subscribers')}`
                  : ''}
                {channel.subscribers != null && channel.video_count != null
                  ? ' · '
                  : ''}
                {channel.video_count != null
                  ? `${formatCount(channel.video_count)} ${t('label.videos')}`
                  : ''}
              </p>
            )}
          </div>
        </div>
      </Link>
      <div className="absolute right-2 top-2">
        <ChannelActionsMenu channelId={channel.channel_id} />
      </div>
    </div>
  );
}
