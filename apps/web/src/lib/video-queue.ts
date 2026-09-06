/**
 * Watch-queue builder for the watch page.
 *
 * When a video is opened WITHOUT a grid-set queue (a cold link, a page
 * refresh, or the watch-history entry point), the watch page builds a queue
 * from the video itself rather than from the page it was tapped on:
 *
 * - If the video belongs to a TV show, the queue is the show's episodes
 *   (positioned so the current episode is current).
 * - Otherwise, the queue is the user's level-matched recommendations.
 *
 * This is the "exception to the load-videos-from-the-grid-into-queue rule"
 * (SPEC-071 §8.2, Watch queue URL hydration).
 */

import type { YouTubeVideo } from '@langplayer/shared';
import { PYTHON_API_URL } from '@/lib/api-url';

/** Parse ISO 8601 duration (PT1H23M45S) or a raw number into seconds. */
function parseDuration(iso: string | number | undefined): number | undefined {
  if (iso == null) return undefined;
  if (typeof iso === 'number') return iso;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/);
  if (!m) return undefined;
  return (parseInt(m[1] ?? '0') * 3600) + (parseInt(m[2] ?? '0') * 60) + parseFloat(m[3] ?? '0');
}

/** A queue built from the video (as opposed to from a grid page). */
export interface BuiltVideoQueue {
  queue: YouTubeVideo[];
  queueType: 'tvShow' | 'recommended';
  metadata?: { tvShow?: { id: number; title: string }; searchTerm?: string };
}

/** Map one TV-show episode row to a YouTubeVideo for the queue. */
function episodeToVideo(ep: any, showTitle?: string): YouTubeVideo {
  return {
    youtube_id: ep.youtube_id,
    title: ep.title,
    id: String(ep.id ?? ''),
    views: ep.views ?? undefined,
    duration: parseDuration(ep.duration),
    difficulty: ep.difficulty ?? undefined,
    tv_show: showTitle,
  };
}

/**
 * Build the queue for a video opened without a grid-set queue. Resolves null
 * when nothing sensible can be built (caller then leaves the queue as-is).
 */
export async function buildVideoQueue(
  video: YouTubeVideo,
  l2Code: string,
  level?: number,
): Promise<BuiltVideoQueue | null> {
  // TV show episode → queue the whole series, positioned on the current video.
  const tvShowId = video.tv_show;
  if (tvShowId) {
    try {
      const id = encodeURIComponent(String(tvShowId));
      const [showRes, episodesRes] = await Promise.all([
        fetch(`${PYTHON_API_URL}/tv-shows/${id}`),
        fetch(
          `${PYTHON_API_URL}/tv-shows/${id}/episodes?l2=${encodeURIComponent(l2Code)}&sort=title`,
        ),
      ]);
      if (!episodesRes.ok) return null;
      const show = showRes.ok ? await showRes.json() : null;
      const episodes: any[] = await episodesRes.json();
      const queue: YouTubeVideo[] = (Array.isArray(episodes) ? episodes : [])
        .map((ep) => episodeToVideo(ep, show?.title))
        .filter((v) => !!v.youtube_id);
      if (queue.length === 0) return null;
      return {
        queue,
        queueType: 'tvShow',
        metadata: { tvShow: { id: Number(tvShowId), title: show?.title ?? '' } },
      };
    } catch {
      return null;
    }
  }

  // Not a TV show → level-matched recommendations. `level` is the user's
  // saved L2 proficiency (from useProgressLevel); when absent the backend
  // returns videos across all levels.
  try {
    const params = new URLSearchParams();
    params.set('l2', l2Code);
    if (level) params.set('level', String(level));
    params.set('limit', '24');
    const res = await fetch(`/api/videos/recommend?${params}`);
    if (!res.ok) return null;
    const data = await res.json();
    const queue: YouTubeVideo[] = Array.isArray(data) ? data : data?.videos ?? [];
    if (queue.length === 0) return null;
    return { queue, queueType: 'recommended' };
  } catch {
    return null;
  }
}
