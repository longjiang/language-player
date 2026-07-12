import Link from 'next/link';
import { Play, Search, Filter, Grid3X3, List } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SUPPORTED_L2S } from '@langplayer/shared';
import { languageNameFromCode } from '@langplayer/utils';

export default function ExplorePage() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      {/* Header */}
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Explore Media</h1>
          <p className="mt-1 text-muted-foreground">
            Find videos, TV shows, and live channels in {SUPPORTED_L2S.length}+ languages
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Filter className="h-4 w-4" /> Filter
          </Button>
          <Button variant="ghost" size="icon">
            <Grid3X3 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon">
            <List className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Language Cards */}
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {SUPPORTED_L2S.slice(0, 30).map((code) => (
          <Link
            key={code}
            href={`/explore/${code}`}
            className="group relative overflow-hidden rounded-xl border border-border bg-surface p-5 transition-all hover:border-brand-300 hover:shadow-md dark:bg-surface-dark-secondary dark:hover:border-brand-700"
          >
            <div className="absolute -right-4 -top-4 flex h-20 w-20 items-center justify-center rounded-full bg-brand-50 text-2xl opacity-50 transition-all group-hover:scale-110 group-hover:opacity-80 dark:bg-brand-900">
              {code === 'zh' ? '中文' : code === 'ja' ? '日本語' : code === 'ko' ? '한국어' : ''}
            </div>
            <h3 className="text-lg font-semibold">{languageNameFromCode(code)}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{code.toUpperCase()}</p>
            <div className="mt-4 flex items-center gap-2 text-sm font-medium text-brand-600 dark:text-brand-400">
              <Play className="h-4 w-4" /> Watch videos
            </div>
          </Link>
        ))}
      </div>

      {/* Coming soon */}
      <div className="mt-12 rounded-2xl border-2 border-dashed border-border p-8 text-center">
        <Search className="mx-auto h-8 w-8 text-muted-foreground" />
        <h3 className="mt-4 text-lg font-semibold">More coming soon</h3>
        <p className="mt-1 text-muted-foreground">
          We&apos;re porting the full Language Player Classic experience. Search, dictionary, phrasebooks,
          and reader are on the way.
        </p>
      </div>
    </main>
  );
}
