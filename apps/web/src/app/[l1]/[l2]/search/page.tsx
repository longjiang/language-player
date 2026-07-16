'use client';

import { useState, useCallback, useEffect, useRef, type FormEvent } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useLanguage } from '@/providers/language-provider';
import { useT } from '@/hooks/use-t';
import { useVideos } from '@langplayer/api-client';
import { apiClient } from '@langplayer/api-client';
import type { YouTubeVideo } from '@langplayer/shared';
import { languageName, baseCode } from '@/lib/language-data';
import { VideoGrid } from '@/components/video/video-grid';
import { Search, Loader2, AlertCircle, Film, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface VideoTag {
  tag: string;
  video_count: number;
}

const YOUTUBE_URL_RE = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;

export default function SearchPage() {
  const { l1, l2 } = useLanguage();
  const t = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const videosApi = useVideos();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<YouTubeVideo[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [tags, setTags] = useState<VideoTag[]>([]);
  const [tagsLoading, setTagsLoading] = useState(true);
  const [tagsExpanded, setTagsExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const loadingRef = useRef(false);

  const INITIAL_TAG_COUNT = 15;
  const visibleTags = tagsExpanded ? tags : tags.slice(0, INITIAL_TAG_COUNT);

  // Fetch popular tags on mount
  useEffect(() => {
    let cancelled = false;
    setTagsLoading(true);
    apiClient.get<VideoTag[]>('/video-tags', {
      params: { l2: baseCode(l2.code), limit: 50, min_count: 2 },
    }).then((data) => {
      if (!cancelled) { setTags(data); setTagsLoading(false); }
    }).catch(() => {
      if (!cancelled) setTagsLoading(false);
    });
    return () => { cancelled = true; };
  }, [l2.code]);

  // Auto-search from ?q= param on first load
  useEffect(() => {
    const q = searchParams.get('q');
    if (q && !searched) {
      setQuery(q);
      setSearched(true);
      setTimeout(() => { doSearch(q); }, 100);
    }
  }, [searchParams, searched]);

  const extractYouTubeID = useCallback((url: string): string | null => {
    const match = url.match(YOUTUBE_URL_RE);
    return (match && match[2]?.length === 11) ? match[2] : null;
  }, []);

  const doSearch = useCallback(async (term: string) => {
    const trimmed = term.trim();
    if (!trimmed || loadingRef.current) return;

    // If it's a YouTube URL, navigate directly to the watch page
    const youtubeId = extractYouTubeID(trimmed);
    if (youtubeId) {
      router.push(`/${l1.code}/${l2.code}/watch/${youtubeId}`);
      return;
    }

    loadingRef.current = true;
    setLoading(true);
    setError(null);
    setResults(null);

    // Update URL
    const params = new URLSearchParams(searchParams.toString());
    params.set('q', trimmed);
    router.replace(`/${l1.code}/${l2.code}/search?${params.toString()}`, { scroll: false });

    try {
      const data = await videosApi.searchByTitle({
        q: trimmed,
        l2: baseCode(l2.code),
        limit: 50,
      });
      setResults(data);
    } catch (err: any) {
      setError(err?.message ?? t('error.something_went_wrong'));
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [videosApi, l2.code, l1.code, t, searchParams, router, extractYouTubeID]);

  const handleSubmit = useCallback((e?: FormEvent) => {
    e?.preventDefault();
    doSearch(query.trim());
  }, [query, doSearch]);

  const handleInputChange = useCallback((value: string) => {
    setQuery(value);
    // Check YouTube URL in real-time (like GO does)
    const youtubeId = extractYouTubeID(value);
    if (youtubeId) {
      router.push(`/${l1.code}/${l2.code}/watch/${youtubeId}`);
    }
  }, [extractYouTubeID, router, l1.code, l2.code]);

  const handleTagClick = useCallback((tag: string) => {
    setQuery(tag);
    doSearch(tag);
  }, [doSearch]);

  const hasResults = results && results.length > 0;
  const hasSearched = results !== null || error !== null;

  return (
    <div className={hasResults ? 'mx-auto max-w-7xl px-4 py-6' : 'mx-auto max-w-2xl px-4 py-12'}>
      {/* Header */}
      {!hasResults && !hasSearched && (
        <>
          <h1 className="text-3xl font-bold">{t('title.search')}</h1>
          <p className="mt-2 text-muted-foreground">
            {t('msg.search_videos_desc', { l2: languageName(l2.code, l1.code) })}
          </p>
        </>
      )}

      {/* Search bar */}
      <form onSubmit={handleSubmit} className={hasResults ? 'mb-6 flex gap-2' : 'mt-8 flex gap-2'}>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
            placeholder={t('placeholder.search_all_content', { language: languageName(l2.code, l1.code) })}
            className="h-10 w-full rounded-lg border border-border bg-background pl-10 pr-3 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            autoFocus
          />
        </div>
        <Button type="submit" disabled={loading || !query.trim()}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
          {t('action.search')}
        </Button>
      </form>

      {/* YouTube URL hint */}
      {!hasResults && !hasSearched && (
        <p className="mt-4 text-sm text-muted-foreground">{t('msg.paste_youtube_url')}</p>
      )}

      {/* Tag cloud */}
      {!hasResults && !hasSearched && (
        <div className="mt-6">
          {tagsLoading ? (
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : tags.length > 0 ? (
            <>
              <div className="flex items-center gap-1.5 mb-3">
                <Tag className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">{t('title.tags')}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {visibleTags.map((item) => (
                  <button
                    key={item.tag}
                    onClick={() => handleTagClick(item.tag)}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-foreground"
                  >
                    #{item.tag}
                  </button>
                ))}
              </div>
              {tags.length > INITIAL_TAG_COUNT && (
                <button
                  onClick={() => setTagsExpanded(!tagsExpanded)}
                  className="mt-3 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {tagsExpanded ? t('action.show_less') : t('action.show_more')}
                </button>
              )}
            </>
          ) : null}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-6 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* No results */}
      {hasSearched && !hasResults && !loading && !error && (
        <div className="mt-12 rounded-2xl border-2 border-dashed border-border p-12 text-center">
          <Film className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <p className="mt-4 text-muted-foreground">{t('msg.no_videos_found')}</p>
        </div>
      )}

      {/* Results */}
      {hasResults && (
        <div>
          <p className="mb-4 mt-6 text-sm text-muted-foreground">
            {t('msg.result_count', { count: results!.length })} {t('msg.for_term', { term: query })}
          </p>
          <VideoGrid videos={results!} />
        </div>
      )}
    </div>
  );
}
