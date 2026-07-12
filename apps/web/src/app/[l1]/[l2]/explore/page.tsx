'use client';

import { useLanguage } from '@/providers/language-provider';
import { Button } from '@/components/ui/button';
import { Play, Search } from 'lucide-react';
import { languageName } from '@/lib/language-data';

export default function ExplorePage() {
  const { l1, l2 } = useLanguage();

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">
            Explore {languageName(l2.code)} Media
          </h1>
          <p className="mt-1 text-muted-foreground">
            Find videos in {languageName(l2.code)} matched to your level
            {l2.has.youtube && ' • YouTube captions available'}
            {l2.has.liveTV && ' • Live TV available'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Search className="h-4 w-4" /> Search
          </Button>
        </div>
      </div>

      {l2.has.youtube ? (
        <div className="rounded-2xl border-2 border-dashed border-border p-12 text-center">
          <Play className="mx-auto h-10 w-10 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-semibold">Video feed coming soon</h3>
          <p className="mt-1 text-muted-foreground">
            The video listing will be ported from the Classic Nuxt app.
            {l2.has.liveTV && ' Live TV channels will also be available.'}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border-2 border-dashed border-border p-12 text-center">
          <Search className="mx-auto h-10 w-10 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-semibold">Limited content for {languageName(l2.code)}</h3>
          <p className="mt-1 text-muted-foreground">
            We don&apos;t have YouTube captions for this language yet, but translated subtitles may still be available.
          </p>
        </div>
      )}
    </div>
  );
}
