import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { PYTHON_API_URL } from '@/lib/api-url';

export type ChannelPref = 'subscribed' | 'not_interested' | 'neutral';

// ── Shared fetch cache ────────────────────────
// All useChannelPreference instances share one in-flight request
// and one cached result per user+l2 pair. This prevents N identical
// POST requests when N video cards each render the hook.

type CacheEntry = {
  promise: Promise<any[]> | null;
  data: any[] | null;
  ts: number;
};

const _cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30_000; // 30 seconds

function _getCacheKey(userId: string, l2: string): string {
  return `${userId}:${l2}`;
}

async function _fetchPreferences(userId: string, l2: string): Promise<any[]> {
  const key = _getCacheKey(userId, l2);
  const cached = _cache.get(key);

  // Return cached data if still fresh
  if (cached?.data && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.data;
  }

  // Reuse in-flight promise so concurrent callers share one request
  if (cached?.promise) {
    return cached.promise;
  }

  const promise = fetch(`${PYTHON_API_URL}/user-channel-preferences`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, l2 }),
  })
    .then((res) => (res.ok ? res.json() : []))
    .then((data: any[]) => {
      _cache.set(key, { promise: null, data, ts: Date.now() });
      return data;
    })
    .catch(() => {
      _cache.delete(key);
      return [];
    });

  _cache.set(key, { promise, data: null, ts: Date.now() });
  return promise;
}

/**
 * Per-channel preference hook.
 *
 * Uses a module-level cache so N concurrent callers for the same
 * user+l2 pair share one fetch request. Preferences are stored on
 * the Python backend via `/save-channel-preference`.
 *
 * Extracted from web's `useChannelPreference` — uses mobile auth
 * and language contexts instead of Next.js session/language providers.
 */
export function useChannelPreference(channelId: string | undefined) {
  const { user } = useAuth();
  const { l2Lang } = useLanguage();
  const userId = user?.id;
  const code = l2Lang.code;

  const [pref, setPref] = useState<ChannelPref>('neutral');
  const [loaded, setLoaded] = useState(false);

  // Fetch preference — uses shared cache to deduplicate across instances
  useEffect(() => {
    if (!userId || !channelId) return;
    let cancelled = false;

    _fetchPreferences(userId, code)
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
  }, [userId, channelId, code]);

  // Save preference — busts cache so next fetch picks up the change
  const savePref = useCallback(
    (status: ChannelPref) => {
      if (!userId || !channelId) return;
      setPref(status);
      // Optimistically bust cache for this user+l2 pair
      _cache.delete(_getCacheKey(userId, code));
      fetch(`${PYTHON_API_URL}/save-channel-preference`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          channel_id: channelId,
          l2: code,
          status,
        }),
      }).catch(() => {});
    },
    [userId, channelId, code],
  );

  return { pref, loaded, savePref };
}
