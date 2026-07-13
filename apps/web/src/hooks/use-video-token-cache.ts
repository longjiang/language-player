'use client';

import { useEffect, useRef, useMemo } from 'react';
import { useVideos } from '@langplayer/api-client';
import { TokenCache } from '@/lib/token-cache';

/**
 * Fetches the pre-computed token cache for a video and makes it available
 * to subtitle components to avoid per-line /lemmatize API calls.
 */
export function useVideoTokenCache(youtubeId: string, l2Code: string) {
  const { getVideoTokenCache } = useVideos();
  const cache = useRef(new TokenCache());
  const loaded = useRef(false);
  const fetching = useRef(false);

  useEffect(() => {
    if (!youtubeId || !l2Code || fetching.current) return;
    fetching.current = true;

    getVideoTokenCache(youtubeId, l2Code)
      .then((response) => {
        const data = response?.data;
        if (data && typeof data === 'object') {
          cache.current.load(data);
        }
        loaded.current = true;
      })
      .catch((err) => {
        console.warn('[VideoTokenCache] Failed to load:', err);
        loaded.current = true;
      });
  }, [youtubeId, l2Code]);

  return useMemo(() => ({
    cache: cache.current,
    loaded: loaded.current,
  }), [loaded.current]);
}
