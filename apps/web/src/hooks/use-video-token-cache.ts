'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import { useVideos } from '@langplayer/api-client';
import { TokenCache } from '@langplayer/utils';

/**
 * Fetches the pre-computed token cache for a video and makes it available
 * to subtitle components to avoid per-line /lemmatize-normalized API calls.
 *
 * @param videoId — Directus video ID (NOT the YouTube ID). Pass undefined
 *   to skip the fetch (e.g., while the video metadata is still loading).
 */
export function useVideoTokenCache(videoId: string | undefined, l2Code: string) {
  const { getVideoTokenCache } = useVideos();
  const cache = useRef(new TokenCache());
  const [loaded, setLoaded] = useState(false);
  const fetching = useRef(false);

  useEffect(() => {
    if (!videoId || !l2Code || fetching.current) return;
    fetching.current = true;

    getVideoTokenCache(videoId, l2Code)
      .then((data) => {
        if (data && typeof data === 'object') {
          cache.current.load(data);
        }
        setLoaded(true);
      })
      .catch((err) => {
        console.warn('[VideoTokenCache] Failed to load:', err);
        setLoaded(true);
      });
  }, [videoId, l2Code]);

  return useMemo(() => ({
    cache: cache.current,
    loaded,
  }), [loaded]);
}
