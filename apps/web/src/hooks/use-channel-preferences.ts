'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useLanguage } from '@/providers/language-provider';
import { baseCode } from '@/lib/language-data';
import { PYTHON_API_URL } from '@/lib/api-url';
import { authenticatedFetch } from '@/lib/authenticated-fetch';

type ChannelStatus = 'subscribed' | 'not_interested' | 'neutral';

interface ChannelPreference {
  channelId: string;
  l2: string;
  status: ChannelStatus;
}

/**
 * All channel preferences for the current user + L2, plus bulk reset actions
 * (SPEC-072). Individual subscribe/unsubscribe stays on `useChannelPreference`.
 */
export function useChannelPreferences() {
  const { data: session } = useSession();
  const { l2 } = useLanguage();
  const userId = session?.user?.id;
  const l2Code = baseCode(l2.code);

  const [subscribed, setSubscribed] = useState<string[]>([]);
  const [notInterested, setNotInterested] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    if (!userId) {
      setSubscribed([]);
      setNotInterested([]);
      setLoaded(true);
      return;
    }
    try {
      const res = await authenticatedFetch(
        `${PYTHON_API_URL}/channel-preferences?l2=${encodeURIComponent(l2Code)}`,
      );
      const data = res.ok ? await res.json() : { preferences: [] };
      const prefs: ChannelPreference[] = data?.preferences ?? [];
      const l2Prefs = prefs.filter((p) => p.l2 === l2Code);
      setSubscribed(
        l2Prefs.filter((p) => p.status === 'subscribed').map((p) => p.channelId),
      );
      setNotInterested(
        l2Prefs
          .filter((p) => p.status === 'not_interested')
          .map((p) => p.channelId),
      );
    } catch {
      setSubscribed([]);
      setNotInterested([]);
    } finally {
      setLoaded(true);
    }
  }, [userId, l2Code]);

  useEffect(() => {
    setLoaded(false);
    void refresh();
  }, [refresh]);

  const reset = useCallback(
    async (channelIds: string[]) => {
      await Promise.all(
        channelIds.map((channelId) =>
          authenticatedFetch(`${PYTHON_API_URL}/channel-preferences`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channelId, l2: l2Code, status: 'neutral' }),
          }),
        ),
      );
      await refresh();
    },
    [l2Code, refresh],
  );

  const resetSubscribed = useCallback(
    () => reset(subscribed),
    [reset, subscribed],
  );
  const resetNotInterested = useCallback(
    () => reset(notInterested),
    [reset, notInterested],
  );

  return {
    subscribed,
    notInterested,
    loaded,
    refresh,
    resetSubscribed,
    resetNotInterested,
  };
}
