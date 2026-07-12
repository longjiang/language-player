'use client';

import { useState } from 'react';
import { useLanguage } from '@/providers/language-provider';
import { useT } from '@/hooks/use-t';
import { VideoGrid } from '@/components/video/video-grid';
import { LevelFilter } from '@/components/video/level-filter';
import { useVideos } from '@/hooks/use-videos';
import { AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { languageName } from '@/lib/language-data';

export default function ExplorePage() {
  const { l2 } = useLanguage();
  const t = useT();
  const [level, setLevel] = useState<number | undefined>(undefined);
  const { videos, loading, error, hasMore, loadMore, retry } = useVideos({
    l2: l2.code,
    level,
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold">
          Explore {languageName(l2.code)} Media
        </h1>
        <p className="mt-1 text-muted-foreground">
          Find videos matched to your level •{' '}
          {l2.has.youtube ? 'YouTube captions available' : 'Translated subtitles available'}
          {l2.has.liveTV ? ' • Live TV available' : ''}
        </p>
      </div>

      {/* Level filter */}
      <div className="mb-6">
        <LevelFilter selected={level} onChange={setLevel} />
      </div>

      {/* Loading — first load */}
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

      {/* Error state */}
      {error && videos.length === 0 && (
        <div className="flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed border-destructive/30 p-12 text-center">
          <AlertCircle className="h-10 w-10 text-destructive" />
          <p className="text-muted-foreground">{error}</p>
          <Button variant="outline" onClick={retry}>{t('action.try_again')}</Button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && videos.length === 0 && (
        <div className="rounded-2xl border-2 border-dashed border-border p-12 text-center">
          <p className="text-muted-foreground">
            {t('msg.no_videos_found')}
          </p>
        </div>
      )}

      {/* Video grid */}
      {videos.length > 0 && (
        <>
          <VideoGrid videos={videos} />

          {/* Load more */}
          {hasMore && (
            <div className="mt-8 text-center">
              <Button
                variant="outline"
                size="lg"
                onClick={loadMore}
                disabled={loading}
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('action.load_more')}
              </Button>
            </div>
          )}

          {!hasMore && videos.length > 0 && (
            <p className="mt-8 text-center text-sm text-muted-foreground">
              {t('msg.end_of_list')}
            </p>
          )}
        </>
      )}
    </div>
  );
}
