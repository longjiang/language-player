import { useEffect, useState, useRef, useMemo } from 'react';
import { useVideos } from '@langplayer/api-client';

class TokenCache {
  private _cache = new Map<string, any>();

  load(data: Record<string, any>) {
    for (const [key, value] of Object.entries(data)) {
      this._cache.set(key, value);
    }
  }

  get(text: string) { return this._cache.get(text); }
  has(text: string) { return this._cache.has(text); }
}

/**
 * Fetches pre-computed token cache for a video to avoid per-line API calls.
 * Ported from apps/web/src/hooks/use-video-token-cache.ts.
 */
export function useVideoTokenCache(youtubeId: string, l2Code: string) {
  const { getVideoTokenCache } = useVideos();
  const cache = useRef(new TokenCache());
  const [loaded, setLoaded] = useState(false);
  const fetching = useRef(false);

  useEffect(() => {
    if (!youtubeId || !l2Code || fetching.current) return;
    fetching.current = true;

    getVideoTokenCache(youtubeId, l2Code)
      .then((data) => {
        if (data && typeof data === 'object') cache.current.load(data);
        setLoaded(true);
      })
      .catch((err) => {
        console.warn('[VideoTokenCache] Failed to load:', err);
        setLoaded(true);
      });
  }, [youtubeId, l2Code]);

  return useMemo(() => ({ cache: cache.current, loaded }), [loaded]);
}
