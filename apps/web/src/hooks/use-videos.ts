'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import type { YouTubeVideo } from '@langplayer/shared';
import type { VideoListResult } from '@/lib/video-service';

interface UseVideosOptions {
  l2: string;
  level?: number;
  pageSize?: number;
  /** Optional cache provider — preserves results across page navigations. */
  cache?: {
    get: (key: string) => { videos: YouTubeVideo[]; hasMore: boolean; error: string | null } | null;
    set: (key: string, entry: { videos: YouTubeVideo[]; hasMore: boolean; error: string | null }) => void;
  };
  /** When true, skip the fetch — wait until this becomes false. */
  defer?: boolean;
}

interface UseVideosResult {
  videos: YouTubeVideo[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
  retry: () => void;
}

function cacheKey(l2: string, level: number | undefined): string {
  return `${l2}:${level ?? 'all'}`;
}

export function useVideos({ l2, level, pageSize = 24, cache, defer }: UseVideosOptions): UseVideosResult {
  const key = cacheKey(l2, level);

  // Restore from cache on mount / level change if available
  const [videos, setVideos] = useState<YouTubeVideo[]>(() => {
    if (cache) {
      const entry = cache.get(key);
      if (entry) return entry.videos;
    }
    return [];
  });
  const [loading, setLoading] = useState(() => {
    // If we restored from cache, we're not loading
    if (cache && cache.get(key)) return false;
    return true;
  });
  const [error, setError] = useState<string | null>(() => {
    if (cache) return cache.get(key)?.error ?? null;
    return null;
  });
  const [hasMore, setHasMore] = useState(() => {
    if (cache) return cache.get(key)?.hasMore ?? true;
    return true;
  });
  const [page, setPage] = useState(1);

  const fetchVideos = useCallback(
    async (pageNum: number, append = false) => {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams();
        params.set('l2', l2);
        if (level) params.set('level', String(level));
        params.set('page', String(pageNum));
        params.set('page_size', String(pageSize));

        const res = await fetch(`/api/videos/recommend?${params}`);
        if (!res.ok) throw new Error(`Failed to load videos (${res.status})`);

        const data: VideoListResult = await res.json();
        const newVideos = data.videos ?? [];

        setVideos((prev) => {
          const updated = append ? [...prev, ...newVideos] : newVideos;
          // Update cache so navigating back restores instantly
          if (cache) {
            cache.set(key, { videos: updated, hasMore: data.hasMore, error: null });
          }
          return updated;
        });
        setHasMore(data.hasMore);
      } catch (err: any) {
        setError(err.message ?? 'Failed to load videos');
      } finally {
        setLoading(false);
      }
    },
    [l2, level, pageSize, cache, key],
  );

  // Need to track the current key for the fetchEffect
  const fetchVideosRef = useRef(fetchVideos);
  fetchVideosRef.current = fetchVideos;

  // Fetch on mount and when filter changes — restore from cache if available,
  // otherwise fetch. Cache restoration is idempotent so StrictMode double-invoke
  // is harmless — both invocations hit the cache and skip the fetch.
  useEffect(() => {
    // Deferred — don't fetch or restore until ready
    if (defer) return;

    // If cache has data for this key, restore it now. This handles the case
    // where the key changed (e.g. level filter) and useState initializers
    // already ran for the previous key — they don't re-run on key change.
    if (cache) {
      const entry = cache.get(key);
      if (entry) {
        setVideos(entry.videos);
        setHasMore(entry.hasMore);
        setError(entry.error);
        setLoading(false);
        // Restore page so "Load More" continues from the right position
        setPage(Math.floor(entry.videos.length / pageSize) + 1);
        return;
      }
    }
    setPage(1);
    fetchVideosRef.current(1, false);
  }, [key, cache, defer]);

  const loadMore = useCallback(() => {
    if (loading || !hasMore) return;
    const nextPage = page + 1;
    setPage(nextPage);
    fetchVideos(nextPage, true);
  }, [loading, hasMore, page, fetchVideos]);

  const retry = useCallback(() => {
    fetchVideos(page, page > 1);
  }, [fetchVideos, page]);

  return { videos, loading, error, hasMore, loadMore, retry };
}
