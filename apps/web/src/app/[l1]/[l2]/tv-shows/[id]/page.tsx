'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useLanguage } from '@/providers/language-provider';
import { useVideoPlayer } from '@/providers/video-player-provider';
import { useT } from '@/hooks/use-t';
import { PYTHON_API_URL } from '@/lib/api-url';
import { ArrowLeft, Loader2, AlertCircle, Tv, Play, Eye, Clock } from 'lucide-react';
import type { YouTubeVideo } from '@langplayer/shared';

interface TvShow {
  id: number;
  title: string;
  youtube_id?: string | null;
  avg_views?: number | null;
  locale?: string | null;
  description?: string | null;
}

interface Episode {
  id: number;
  youtube_id: string;
  title: string;
  views?: number | null;
  duration?: string | null;
  date?: string | null;
  level?: number | null;
  tv_show?: number | null;
}

export default function TvShowEpisodesPage() {
  const params = useParams<{ l1: string; l2: string; id: string }>();
  const router = useRouter();
  const { l1, l2 } = useLanguage();
  const { playVideo } = useVideoPlayer();
  const t = useT();
  const showId = Number(params.id);

  const [show, setShow] = useState<TvShow | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!showId) return;
    let cancelled = false;

    setLoading(true);
    setError(null);

    // Fetch show info + episodes in parallel
    Promise.all([
      fetch(`${PYTHON_API_URL}/tv-shows/${showId}`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
      fetch(`${PYTHON_API_URL}/tv-shows/${showId}/episodes?sort=title`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
    ])
      .then(([showData, episodesData]) => {
        if (!cancelled) {
          setShow(showData);
          setEpisodes(Array.isArray(episodesData) ? episodesData : []);
          setLoading(false);
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError('Failed to load episodes');
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [showId]);

  // Map episodes to YouTubeVideo format for the queue
  const episodeVideos = useCallback((): YouTubeVideo[] => {
    return episodes.map(ep => ({
      youtube_id: ep.youtube_id,
      title: ep.title,
      id: String(ep.id),
      views: ep.views ?? undefined,
      duration: ep.duration ? parseDuration(ep.duration) : undefined,
      locale: show?.locale ?? undefined,
      tv_show: show?.title,
    }));
  }, [episodes, show]);

  // Handle click on an episode row — set queue + navigate
  const handlePlayEpisode = useCallback((ep: Episode, idx: number) => {
    const queue = episodeVideos();
    const video = queue[idx];
    if (video) {
      playVideo(video, queue, 'tvShow', {
        tvShow: show ? { id: show.id, title: show.title } : undefined,
      });
    }
  }, [episodeVideos, playVideo, show]);

  // Format duration from ISO 8601 or seconds
  const formatDuration = (dur?: string | null): string => {
    if (!dur) return '';
    // Try ISO 8601: PT1H23M45S
    const iso = dur.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (iso) {
      const h = iso[1] ? `${iso[1]}:` : '';
      const m = iso[2] ? iso[2].padStart(2, '0') : '00';
      const s = iso[3] ? iso[3].padStart(2, '0') : '00';
      return `${h}${m}:${s}`;
    }
    // Try plain seconds
    const secs = parseInt(dur, 10);
    if (!isNaN(secs)) {
      const h = Math.floor(secs / 3600);
      const m = Math.floor((secs % 3600) / 60);
      const s = secs % 60;
      return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
    }
    return dur;
  };

  // Parse duration string to seconds
  const parseDuration = (dur: string): number => {
    const iso = dur.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (iso) {
      const h = parseInt(iso[1] ?? '0', 10);
      const m = parseInt(iso[2] ?? '0', 10);
      const s = parseInt(iso[3] ?? '0', 10);
      return h * 3600 + m * 60 + s;
    }
    const secs = parseInt(dur, 10);
    return isNaN(secs) ? 0 : secs;
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {/* Back */}
      <button
        onClick={() => router.back()}
        className="mb-6 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        {t('action.back')}
      </button>

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Show header */}
      {show && (
        <div className="mb-8">
          <div className="flex items-center gap-3">
            <Tv className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-3xl font-bold">{show.title}</h1>
              {show.locale && (
                <span className="text-sm text-muted-foreground uppercase">{show.locale}</span>
              )}
            </div>
          </div>
          {show.description && (
            <p className="mt-3 text-muted-foreground">{show.description}</p>
          )}
        </div>
      )}

      {/* Episodes list */}
      {!loading && !error && (
        <>
          <h2 className="mb-4 text-lg font-semibold">
            {t('title.episodes')} ({episodes.length})
          </h2>

          {episodes.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-border p-12 text-center">
              <Tv className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <p className="mt-4 text-muted-foreground">{t('msg.no_episodes')}</p>
            </div>
          ) : (
            <div className="space-y-1">
              {episodes.map((ep, idx) => (
                <button
                  key={ep.id}
                  onClick={() => handlePlayEpisode(ep, idx)}
                  className="flex items-center gap-4 rounded-lg px-4 py-3 transition-colors hover:bg-muted/50 group w-full text-left"
                >
                  {/* Episode number */}
                  <span className="flex-shrink-0 w-8 text-center text-sm font-medium text-muted-foreground">
                    {idx + 1}
                  </span>

                  {/* Thumbnail placeholder + info */}
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="flex-shrink-0 w-28 h-16 rounded bg-muted flex items-center justify-center overflow-hidden">
                      <Play className="h-5 w-5 text-muted-foreground/50 group-hover:text-primary transition-colors" />
                    </div>

                    <div className="min-w-0">
                      <h3 className="font-medium text-sm group-hover:text-primary transition-colors line-clamp-2">
                        {ep.title}
                      </h3>
                      <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                        {ep.duration && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDuration(ep.duration)}
                          </span>
                        )}
                        {ep.views != null && ep.views > 0 && (
                          <span className="flex items-center gap-1">
                            <Eye className="h-3 w-3" />
                            {ep.views.toLocaleString()}
                          </span>
                        )}
                        {ep.level != null && (
                          <span className="rounded bg-muted px-1.5 py-0.5 text-xs">
                            L{ep.level}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
