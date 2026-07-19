'use client';

import { useState, useEffect, useRef } from 'react';
import { useLanguage } from '@/providers/language-provider';
import { useT } from '@/hooks/use-t';
import { useProgress } from '@/hooks/use-progress';
import { useExploreCache } from '@/providers/explore-cache-provider';
import { VideoGrid } from '@/components/video/video-grid';
import { LevelFilter } from '@/components/video/level-filter';
import { useVideos } from '@/hooks/use-videos';
import { AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { languageName, baseCode } from '@/lib/language-data';

export default function MusicPage() {
  const { l1, l2 } = useLanguage();
  const t = useT();
  const { level: savedLevel, loaded: progressLoaded } = useProgress(baseCode(l2.code));
  const [level, setLevel] = useState<number | undefined>(undefined);
  const exploreCache = useExploreCache();

  const seededRef = useRef(false);
  useEffect(() => {
    if (!seededRef.current && progressLoaded && savedLevel !== undefined) {
      seededRef.current = true;
      setLevel(savedLevel);
    }
  }, [progressLoaded, savedLevel]);

  const deferFetch = !progressLoaded;

  const { videos, loading, error, hasMore, loadMore, retry } = useVideos({
    l2: baseCode(l2.code),
    level,
    cache: exploreCache,
    defer: deferFetch,
    endpoint: '/api/videos/recommend-music',
  });

  // ── Infinite scroll ─────────────────────────────────────────────
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry?.isIntersecting && !loading) loadMore(); },
      { rootMargin: '200px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loading, loadMore]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">
          🎵 {t('msg.music_and_entertainment_for', { l2: languageName(l2.code, l1.code) })}
        </h1>
        <p className="mt-1 text-muted-foreground">
          {t('msg.music_and_entertainment_desc')}
        </p>
      </div>

      <div className="mb-6">
        <LevelFilter selected={level} onChange={setLevel} l2Code={baseCode(l2.code)} />
      </div>

      {loading && videos.length === 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-xl border border-border">
              <div className="aspect-video animate-pulse bg-muted" />
              <div className="space-y-2 p-3">
                <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      )}

      {error && videos.length === 0 && (
        <div className="flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed border-destructive/30 p-12 text-center">
          <AlertCircle className="h-10 w-10 text-destructive" />
          <p className="text-muted-foreground">{error}</p>
          <Button variant="outline" onClick={retry}>{t('action.try_again')}</Button>
        </div>
      )}

      {!loading && !error && videos.length === 0 && (
        <div className="rounded-2xl border-2 border-dashed border-border p-12 text-center">
          <p className="text-muted-foreground">{t('msg.no_videos_found')}</p>
        </div>
      )}

      {videos.length > 0 && (
        <>
          <VideoGrid videos={videos} queueType="recommended" />
          <div ref={sentinelRef} className="mt-8 flex justify-center pb-8">
            {loading && hasMore && (
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            )}
            {!hasMore && (
              <p className="text-sm text-muted-foreground">{t('msg.end_of_list')}</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
