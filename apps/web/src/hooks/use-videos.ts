'use client';

import { useEffect, useState, useCallback } from 'react';
import type { YouTubeVideo } from '@langplayer/shared';
import type { VideoListResult } from '@/lib/video-service';

interface UseVideosOptions {
  l2: string;
  level?: number;
  pageSize?: number;
}

interface UseVideosResult {
  videos: YouTubeVideo[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
  retry: () => void;
}

export function useVideos({ l2, level, pageSize = 24 }: UseVideosOptions): UseVideosResult {
  const [videos, setVideos] = useState<YouTubeVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
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

        setVideos((prev) => (append ? [...prev, ...newVideos] : newVideos));
        setHasMore(data.hasMore);
      } catch (err: any) {
        setError(err.message ?? 'Failed to load videos');
      } finally {
        setLoading(false);
      }
    },
    [l2, level, pageSize],
  );

  // Fetch on mount and when filter changes
  useEffect(() => {
    setPage(1);
    // Don't clear videos — preserves existing cards to avoid unmount/remount
    // churn that would cause child hooks (e.g. useChannelPreference) to re-fire.
    // Loading state + empty-result guard in the page handles the UX.
    fetchVideos(1, false);
  }, [fetchVideos]);

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
