'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useLanguage } from '@/providers/language-provider';
import { baseCode } from '@/lib/language-data';
import { PYTHON_API_URL } from '@/lib/api-url';
import { Button } from '@/components/ui/button';
import {
  Loader2,
  MoreVertical,
  Bell,
  BellOff,
  EyeOff,
  Eye,
} from 'lucide-react';

type ChannelPref = 'subscribed' | 'not_interested' | 'neutral';

interface ChannelInfo {
  title: string;
  thumbnail: string;
}

interface ChannelCardProps {
  channelId: string;
}

export function YouTubeChannelCard({ channelId }: ChannelCardProps) {
  const { data: session } = useSession();
  const { l2 } = useLanguage();
  const userId = session?.user?.id;
  const token = (session?.user as any)?.directusToken as string | undefined;

  const [channel, setChannel] = useState<ChannelInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [pref, setPref] = useState<ChannelPref>('neutral');
  const [menuOpen, setMenuOpen] = useState(false);

  // ── Fetch channel info ──

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

  // ── Fetch preference ──

  useEffect(() => {
    if (!userId || !channelId) return;
    let cancelled = false;

    fetch(`${PYTHON_API_URL}/user-channel-preferences`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, l2: baseCode(l2.code) }),
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data: any[]) => {
        if (cancelled) return;
        const pref = data.find(
          (p: any) =>
            String(p.channel_id) === channelId || p.channel_id === channelId,
        );
        if (pref?.status) setPref(pref.status as ChannelPref);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [userId, channelId, l2.code]);

  // ── Save preference ──

  const savePref = useCallback(
    (status: ChannelPref) => {
      if (!userId) return;
      setPref(status);
      setMenuOpen(false);

      fetch(`${PYTHON_API_URL}/save-channel-preference`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          channel_id: channelId,
          l2: baseCode(l2.code),
          status,
        }),
      }).catch(() => {});
    },
    [userId, channelId, l2.code],
  );

  // ── Loading ──

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading channel...
      </div>
    );
  }

  if (!channel) return null;

  // ── Render ──

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
      {/* Avatar */}
      <a
        href={`https://www.youtube.com/channel/${channelId}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-shrink-0"
      >
        <img
          src={channel.thumbnail || `https://www.youtube.com/favicon.ico`}
          alt=""
          className="h-10 w-10 rounded-full object-cover"
        />
      </a>

      {/* Name */}
      <div className="min-w-0 flex-1">
        <a
          href={`https://www.youtube.com/channel/${channelId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium hover:text-primary transition-colors line-clamp-1"
        >
          {channel.title}
        </a>
      </div>

      {/* Menu */}
      <div className="relative flex-shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setMenuOpen(!menuOpen)}
          title="Channel preferences"
        >
          <MoreVertical className="h-4 w-4" />
        </Button>

        {menuOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setMenuOpen(false)}
            />
            <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-lg border border-border bg-card p-1 shadow-lg">
              {pref !== 'subscribed' ? (
                <button
                  onClick={() => savePref('subscribed')}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  <Bell className="h-4 w-4" />
                  Subscribe
                </button>
              ) : (
                <button
                  onClick={() => savePref('neutral')}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  <BellOff className="h-4 w-4" />
                  Unsubscribe
                </button>
              )}

              {pref !== 'not_interested' ? (
                <button
                  onClick={() => savePref('not_interested')}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  <EyeOff className="h-4 w-4" />
                  Not Interested
                </button>
              ) : (
                <button
                  onClick={() => savePref('neutral')}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  <Eye className="h-4 w-4" />
                  Remove &quot;Not Interested&quot;
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
