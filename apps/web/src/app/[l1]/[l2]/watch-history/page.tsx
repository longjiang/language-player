'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useLanguage } from '@/providers/language-provider';
import { useT } from '@/hooks/use-t';
import { useVideoPlayer } from '@/providers/video-player-provider';
import { baseCode } from '@/lib/language-data';
import { PYTHON_API_URL } from '@/lib/api-url';
import { youtubeThumbnail } from '@/lib/video-service';
import { Loader2, AlertCircle, Clock, Play } from 'lucide-react';
import type { YouTubeVideo } from '@langplayer/shared';

interface WatchHistoryItem {
  id: number;
  channel_id?: string;
  l2?: number;
  title?: string;
  youtube_id: string;
  duration?: number;
  date?: string;
  last_position?: number;
}

function formatDuration(seconds: number | undefined): string {
  if (!seconds) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatProgress(seconds: number | undefined, duration: number | undefined): string {
  if (!seconds || !duration) return '';
  const pct = Math.round((seconds / duration) * 100);
  return `${pct}%`;
}

export default function WatchHistoryPage() {
  const { data: session, status: sessionStatus } = useSession();
  const { l1, l2 } = useLanguage();
  const { playVideo } = useVideoPlayer();
  const t = useT();
  const userId = session?.user?.id;

  const [items, setItems] = useState<WatchHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sessionStatus === 'loading') return;
    if (!userId) {
      setLoading(false);
      setError('Not authenticated');
      return;
    }
    if (!l2.code) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`${PYTHON_API_URL}/user-watch-history`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: userId, l2: baseCode(l2.code) }),
    })
      .then((res) => {
        // 404 = no history yet (not an error)
        if (res.status === 404) return [];
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: WatchHistoryItem[]) => {
        if (cancelled) return;
        const seen = new Set<string>();
        const unique = (Array.isArray(data) ? data : []).filter((item) => {
          if (seen.has(item.youtube_id)) return false;
          seen.add(item.youtube_id);
          return true;
        });
        setItems(unique);
        setLoading(false);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err?.message ?? 'Failed to load watch history');
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [userId, l2.code, sessionStatus]);

  const handlePlay = (item: WatchHistoryItem, idx: number) => {
    const queue: YouTubeVideo[] = items.map((i) => ({
      youtube_id: i.youtube_id,
      title: i.title,
      id: String(i.id),
      duration: i.duration,
    }));
    const video = queue[idx];
    if (video) {
      playVideo(video, queue, 'recommended');
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-6 text-3xl font-bold">{t('title.watch_history')}</h1>

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Empty */}
      {!loading && !error && items.length === 0 && (
        <div className="rounded-2xl border-2 border-dashed border-border p-12 text-center">
          <Clock className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <p className="mt-4 text-muted-foreground">No watch history yet.</p>
        </div>
      )}

      {/* List */}
      {!loading && !error && items.length > 0 && (
        <div className="space-y-1">
          {items.map((item, idx) => {
            const progressPct = formatProgress(item.last_position, item.duration);

            return (
              <button
                key={`${item.id}-${idx}`}
                onClick={() => handlePlay(item, idx)}
                className="flex w-full items-center gap-4 rounded-lg px-4 py-3 text-left transition-colors hover:bg-muted/50 group"
              >
                {/* Thumbnail */}
                <div className="relative h-16 w-28 flex-shrink-0 overflow-hidden rounded bg-muted">
                  <img
                    src={youtubeThumbnail(item.youtube_id)}
                    alt=""
                    className="h-full w-full object-cover group-hover:opacity-90 transition-opacity"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors">
                    <Play className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  {/* Progress bar */}
                  {item.last_position != null && item.last_position > 0 && item.duration && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/30">
                      <div
                        className="h-full bg-primary"
                        style={{ width: `${Math.min((item.last_position / item.duration) * 100, 100)}%` }}
                      />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <h3 className="font-medium text-sm line-clamp-2 group-hover:text-primary transition-colors">
                    {item.title ?? 'Untitled'}
                  </h3>
                  <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                    {item.duration && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDuration(item.duration)}
                      </span>
                    )}
                    {item.date && (
                      <span>{formatDate(item.date)}</span>
                    )}
                    {progressPct && (
                      <span className="text-primary font-medium">{progressPct} watched</span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
