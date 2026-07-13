'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useLanguage } from '@/providers/language-provider';
import { baseCode } from '@/lib/language-data';
import { PYTHON_API_URL } from '@/lib/api-url';

export type ChannelPref = 'subscribed' | 'not_interested' | 'neutral';

export function useChannelPreference(channelId: string | undefined) {
  const { data: session } = useSession();
  const { l2 } = useLanguage();
  const userId = session?.user?.id;

  const [pref, setPref] = useState<ChannelPref>('neutral');
  const [loaded, setLoaded] = useState(false);

  // Fetch preference
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
        const match = data.find(
          (p: any) => String(p.channel_id) === channelId || p.channel_id === channelId,
        );
        if (match?.status) setPref(match.status as ChannelPref);
        setLoaded(true);
      })
      .catch(() => { if (!cancelled) setLoaded(true); });

    return () => { cancelled = true; };
  }, [userId, channelId, l2.code]);

  // Save preference
  const savePref = useCallback(
    (status: ChannelPref) => {
      if (!userId || !channelId) return;
      setPref(status);
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

  return { pref, loaded, savePref };
}
