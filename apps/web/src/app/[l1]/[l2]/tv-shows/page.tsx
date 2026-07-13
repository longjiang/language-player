'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/providers/language-provider';
import { useT } from '@/hooks/use-t';
import { languageName, baseCode } from '@/lib/language-data';
import { PYTHON_API_URL } from '@/lib/api-url';
import type { TVShow } from '@langplayer/shared';
import { Search, Loader2, AlertCircle, Tv, Filter, Globe } from 'lucide-react';

interface ShowWithMeta extends TVShow {
  year?: number;
  avg_views?: number;
  description?: string;
  poster?: string;
}

type SortKey = 'views' | 'title' | 'year';

export default function TVShowsPage() {
  const { l1, l2 } = useLanguage();
  const t = useT();
  const [shows, setShows] = useState<ShowWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('views');
  const [localeFilter, setLocaleFilter] = useState('all');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`${PYTHON_API_URL}/tv-shows?l2=${baseCode(l2.code)}&limit=200`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(data => {
        if (!cancelled) {
          setShows(Array.isArray(data) ? data : []);
          setLoading(false);
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err?.message ?? 'Failed to load TV shows');
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [l2.code]);

  // Unique locales for filter
  const locales = useMemo(() => {
    const set = new Set<string>();
    shows.forEach(s => { if (s.locale) set.add(s.locale); });
    return ['all', ...Array.from(set).sort()];
  }, [shows]);

  // Filter + sort
  const filtered = useMemo(() => {
    let result = [...shows];

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(s => s.title.toLowerCase().includes(q));
    }

    if (localeFilter !== 'all') {
      result = result.filter(s => s.locale === localeFilter);
    }

    result.sort((a, b) => {
      switch (sortKey) {
        case 'title': return a.title.localeCompare(b.title);
        case 'year': return (b.year ?? 0) - (a.year ?? 0);
        case 'views':
        default: return (b.avg_views ?? 0) - (a.avg_views ?? 0);
      }
    });

    return result;
  }, [shows, search, sortKey, localeFilter]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold">{t('title.tv_shows')}</h1>
        <p className="mt-1 text-muted-foreground">
          {t('msg.tv_shows_desc', { l2: languageName(l2.code) })}
        </p>
      </div>

      {/* Toolbar: search + sort + locale filter */}
      <div className="mb-6 flex flex-wrap gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('action.search') + '...'}
            className="h-10 w-full rounded-lg border border-border bg-background pl-10 pr-3 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        {/* Sort */}
        <select
          value={sortKey}
          onChange={e => setSortKey(e.target.value as SortKey)}
          className="h-10 rounded-lg border border-border bg-background px-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="views">{t('sort.most_viewed')}</option>
          <option value="title">{t('sort.title')}</option>
          <option value="year">{t('sort.year')}</option>
        </select>

        {/* Locale filter */}
        {locales.length > 2 && (
          <select
            value={localeFilter}
            onChange={e => setLocaleFilter(e.target.value)}
            className="h-10 rounded-lg border border-border bg-background px-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {locales.map(loc => (
              <option key={loc} value={loc}>
                {loc === 'all' ? t('title.filter_by_locale') : loc.toUpperCase()}
              </option>
            ))}
          </select>
        )}
      </div>

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
      {!loading && !error && filtered.length === 0 && (
        <div className="rounded-2xl border-2 border-dashed border-border p-12 text-center">
          <Tv className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <p className="mt-4 text-muted-foreground">{t('msg.no_shows_found')}</p>
        </div>
      )}

      {/* Grid */}
      {!loading && filtered.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map(show => (
            <ShowCard key={show.id} show={show} l1Code={l1.code} l2Code={l2.code} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Individual show card — poster + title + year + views. */
function ShowCard({ show, l1Code, l2Code }: { show: ShowWithMeta; l1Code: string; l2Code: string }) {
  return (
    <Link
      href={`/${l1Code}/${l2Code}/tv-shows/${show.id}`}
      className="group overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-colors hover:border-primary/30"
    >
      {/* Poster */}
      <div className="relative aspect-[2/3] bg-muted">
        {show.poster ? (
          <img
            src={show.poster}
            alt={show.title}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Tv className="h-12 w-12 text-muted-foreground/30" />
          </div>
        )}
        {/* Views badge */}
        {show.avg_views != null && show.avg_views > 0 && (
          <span className="absolute bottom-2 right-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">
            {show.avg_views.toLocaleString()} views
          </span>
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        <h3 className="font-semibold text-sm line-clamp-2">{show.title}</h3>
        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          {show.year && <span>{show.year}</span>}
          {show.locale && (
            <span className="flex items-center gap-0.5">
              <Globe className="h-3 w-3" />
              {show.locale.toUpperCase()}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
