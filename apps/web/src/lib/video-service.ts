/**
 * Video data service — fetches from Python backend which proxies Directus 8.
 * Used by Server Components in the Next.js App Router.
 */

import type { YouTubeVideo } from '@langplayer/shared';

const PYTHON_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://python.zerotohero.ca';

export interface VideoListParams {
  l2: string;
  level?: number;
  page?: number;
  pageSize?: number;
  search?: string;
  category?: string;
}

export interface VideoListResult {
  videos: YouTubeVideo[];
  total: number;
  page: number;
  hasMore: boolean;
}

/** Fetch recommended videos for a language + level. */
export async function getRecommendedVideos(
  l2: string,
  level?: number,
  page = 1,
  pageSize = 24,
): Promise<VideoListResult> {
  try {
    const params = new URLSearchParams();
    params.set('l2', l2);
    if (level) params.set('level', String(level));
    params.set('page', String(page));
    params.set('page_size', String(pageSize));

    const res = await fetch(`${PYTHON_URL}/video/recommend?${params}`, {
      cache: 'no-store', // recommendations are personalized
    });

    if (!res.ok) throw new Error(`Failed to fetch videos: ${res.status}`);

    const data = await res.json();
    const videos: YouTubeVideo[] = Array.isArray(data) ? data : data?.data ?? [];

    return {
      videos,
      total: videos.length,
      page,
      hasMore: videos.length >= pageSize,
    };
  } catch (error) {
    console.error('getRecommendedVideos error:', error);
    return { videos: [], total: 0, page: 1, hasMore: false };
  }
}

/** Get a single video by its YouTube ID. */
export async function getVideoById(youtubeId: string): Promise<YouTubeVideo | null> {
  try {
    const res = await fetch(`${PYTHON_URL}/video/${youtubeId}`, {
      cache: 'no-store',
    });

    if (!res.ok) return null;
    const data = await res.json();
    return data?.data ?? data ?? null;
  } catch {
    return null;
  }
}

/** Get synced subtitles (L1 + L2 lines) for a video. */
export async function getSyncedSubtitles(
  youtubeId: string,
  l1: string,
  l2: string,
): Promise<{ l1Line: string; l2Line: string; starttime: number }[]> {
  try {
    const params = new URLSearchParams();
    params.set('youtube_id', youtubeId);
    params.set('l1', l1);
    params.set('l2', l2);

    const res = await fetch(`${PYTHON_URL}/video/sync-subtitles?${params}`, {
      cache: 'no-store',
    });

    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : data?.data ?? [];
  } catch {
    return [];
  }
}

/** Build a YouTube thumbnail URL from a video ID. */
export function youtubeThumbnail(youtubeId: string, quality: 'default' | 'mqdefault' | 'hqdefault' | 'maxresdefault' = 'mqdefault'): string {
  return `https://img.youtube.com/vi/${youtubeId}/${quality}.jpg`;
}

/** Build a YouTube watch URL. */
export function youtubeWatchUrl(youtubeId: string): string {
  return `https://www.youtube.com/watch?v=${youtubeId}`;
}
