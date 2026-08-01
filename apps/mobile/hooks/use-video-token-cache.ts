import { useEffect, useState, useRef, useMemo } from 'react';
import { useVideos } from '@langplayer/api-client';
import { logwarn } from '@/lib/logger';

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
 *
 * @param videoId — Directus video ID (NOT the YouTube ID). Pass an empty string
 *   to skip the fetch (e.g., while the video metadata is still loading).
 */
export function useVideoTokenCache(videoId: string, l2Code: string) {
  const { getVideoTokenCache } = useVideos();
  const cache = useRef(new TokenCache());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!l2Code) return;
    // No Directus video id (imported video, not in our DB): there is nothing
    // to pre-lemmatize, so mark the cache as loaded immediately. TokenizedText
    // then falls through to the on-the-fly lemmatization pipeline instead of
    // waiting forever for a cache that will never arrive.
    if (!videoId) {
      cache.current = new TokenCache();
      setLoaded(true);
      return;
    }

    // Reset for new video — clear stale cache and mark as loading.
    cache.current = new TokenCache();
    setLoaded(false);

    const controller = new AbortController();

    getVideoTokenCache(videoId, l2Code)
      .then((data) => {
        if (controller.signal.aborted) return;
        if (data && typeof data === 'object') cache.current.load(data);
        setLoaded(true);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        logwarn('[VideoTokenCache] Failed to load:', err);
        setLoaded(true); // still mark loaded so TokenizedText falls through to lemmatizeText()
      });

    return () => controller.abort();
  }, [videoId, l2Code]);

  return useMemo(() => ({ cache: cache.current, loaded }), [loaded]);
}
