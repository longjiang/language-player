'use client';

import { useEffect, useState } from 'react';
import { useT } from '@/hooks/use-t';
import { baseCode, languageName } from '@/lib/language-data';
import { PYTHON_API_URL } from '@/lib/api-url';
import { cn } from '@/lib/utils';
import { log } from '@/lib/logger';
import { AlertCircle, ImageOff, Loader2 } from 'lucide-react';

const OPENVERSE_IMAGES_URL = 'https://api.openverse.org/v1/images/';
const PAGE_SIZE = 20;
const THUMBNAIL_TIMEOUT_MS = 5000;


interface OpenverseImage {
  id: string;
  title: string;
  thumbnail: string | null;
  url: string;
  foreign_landing_url: string | null;
  creator: string | null;
  provider: string;
  attribution: string;
  /** The search query this result came from (set when merging). */
  sourceQuery?: string;
}

interface OpenverseResponse {
  results: OpenverseImage[];
}

/**
 * Openverse has no language filter, so for Latin-script terms we append the
 * target language's native name to the query to disambiguate (e.g. "chat" →
 * French cat vs English small talk). Terms already in a non-Latin script
 * (CJK, Cyrillic, Arabic…) are language-specific as-is and would lose results
 * if we appended anything.
 */
const NON_LATIN_RE = /[^\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}]/u;

function buildImageQuery(term: string, l2Code: string): string {
  if (baseCode(l2Code) === 'en' || NON_LATIN_RE.test(term)) return term;
  return `${term} ${languageName(l2Code)}`;
}

/**
 * Dead-thumbnail sniffing: verify a thumbnail actually returns an image before
 * rendering. Uses HEAD so it's cheap and parallel. Openverse returns 424
 * "Failed Dependency" for records whose upstream image is gone, so anything
 * non-2xx is pruned — except 429 (rate limit is retryable, not dead). Hosts
 * that block CORS are kept as-is: an <img> tag can still load them even when
 * fetch can't inspect the response.
 */
async function sniffThumbnail(
  img: OpenverseImage,
  signal: AbortSignal,
): Promise<OpenverseImage | null> {
  const target = img.thumbnail ?? img.url;
  if (!target) return img;

  const timedOut: Promise<null> = new Promise((resolve) => {
    setTimeout(() => resolve(null), THUMBNAIL_TIMEOUT_MS);
  });

  try {
    const res = await Promise.race([
      fetch(target, { method: 'HEAD', signal }),
      timedOut,
    ]);
    if (res === null) return img; // timed out — keep rather than risk a false drop
    if (!res.ok && res.status !== 429) {
      log('[ImageSearch] Thumbnail dead, filtered:', img.title, target, `HTTP ${res.status}`);
      return null;
    }
    return img;
  } catch {
    return img; // CORS/network error — can't verify, keep (img tag may still load it)
  }
}

export function ImageSearchResults({
  term,
  l2Code,
  l1Code = 'en',
  definition,
  contextText,
  contextForm,
}: {
  term: string;
  l2Code: string;
  l1Code?: string;
  definition?: string;
  /** Surrounding sentence the word appears in (biases query sense). */
  contextText?: string;
  /** Inflected form of the word as it appears in contextText. */
  contextForm?: string;
}) {
  const t = useT();
  const [images, setImages] = useState<OpenverseImage[] | null>(null);
  const [queries, setQueries] = useState<string[]>([]);
  const [activeQuery, setActiveQuery] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setImages(null);
    setError(null);
    setQueries([]);
    setActiveQuery(null);

    const run = async () => {
      // 1. Ask the backend for LLM-rewritten queries (cached server-side).
      //    Fall back to a direct search if the LLM step is unavailable.
      let searchQueries: string[] = [];
      try {
        const res = await fetch(`${PYTHON_API_URL}/dictionary/image-queries`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            word: term,
            l2: l2Code,
            l1: l1Code,
            definition,
            context: contextText,
            contextForm,
          }),
          signal: controller.signal,
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.queries)) {
            searchQueries = data.queries.filter(
              (q: unknown): q is string => typeof q === 'string' && q.trim().length > 0,
            );
          }
        }
      } catch {
        // LLM unavailable — fall through to the direct search below.
      }
      if (cancelled) return;

      // Always include the default direct-search term (the headword, with the
      // language hint for Latin-script terms) as the first pill.
      searchQueries = [buildImageQuery(term, l2Code), ...searchQueries];
      // Dedupe case-insensitively (the LLM may echo the original term).
      const seenQuery = new Set<string>();
      searchQueries = searchQueries.filter((q) => {
        const lower = q.toLowerCase();
        if (seenQuery.has(lower)) return false;
        seenQuery.add(lower);
        return true;
      });
      setQueries(searchQueries);

      // 2. Search Openverse per query; merge results and dedupe by source page.
      const merged: OpenverseImage[] = [];
      const seen = new Set<string>();
      let failures = 0;

      await Promise.all(searchQueries.map(async (q) => {
        const url = `${OPENVERSE_IMAGES_URL}?q=${encodeURIComponent(q)}&page_size=${PAGE_SIZE}&filter_dead=true`;
        log('[ImageSearch] Openverse fetch:', q, url);
        try {
          const res = await fetch(url, { signal: controller.signal });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json() as OpenverseResponse;
          for (const img of data.results ?? []) {
            const key = (img.foreign_landing_url ?? img.url ?? img.id).replace(/[?#].*$/, '');
            if (!seen.has(key)) {
              seen.add(key);
              merged.push({ ...img, sourceQuery: q });
            }
          }
        } catch (err: any) {
          if (err?.name !== 'AbortError') failures++;
        }
      }));

      if (!cancelled) {
        if (merged.length === 0 && failures > 0 && failures >= searchQueries.length) {
          setError('Openverse request failed');
        } else {
          // Prune dead thumbnails before showing the grid.
          const pruned = (
            await Promise.all(merged.map((img) => sniffThumbnail(img, controller.signal)))
          ).filter((img): img is OpenverseImage => img !== null);
          if (!cancelled) setImages(pruned);
        }
      }
    };

    run();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [term, l2Code, l1Code, definition, contextText, contextForm]);

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
        <AlertCircle className="h-4 w-4 flex-shrink-0" />
        {t('msg.failed_to_load_images')}
      </div>
    );
  }

  if (!images) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const visibleImages = activeQuery
    ? images.filter((img) => img.sourceQuery === activeQuery)
    : images;

  if (images.length === 0) {
    return (
      <>
        <QueryPills queries={queries} activeQuery={activeQuery} onSelect={setActiveQuery} />
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
          <ImageOff className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">{t('msg.no_images_found', { term })}</p>
        </div>
      </>
    );
  }

  return (
    <>
      <QueryPills queries={queries} activeQuery={activeQuery} onSelect={setActiveQuery} />
      {visibleImages.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
          <ImageOff className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            {t('msg.no_images_found', { term: activeQuery ?? term })}
          </p>
        </div>
      ) : (
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {visibleImages.map((image) => (
          <a
            key={image.id}
            href={image.foreign_landing_url ?? image.url}
            target="_blank"
            rel="noopener noreferrer"
            title={image.attribution || image.title}
            className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-muted"
          >
            {image.thumbnail ?? image.url ? (
              // Openverse serves a proxied thumbnail designed for embedding;
              // clicking opens the image's source page.
              <img
                src={image.thumbnail ?? image.url}
                alt={image.title || term}
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <ImageOff className="h-5 w-5 text-muted-foreground/50" />
              </div>
            )}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 pb-1.5 pt-4 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
              <p className="truncate">{image.title || term}</p>
              <p className="truncate opacity-80">
                {image.creator ? `${image.creator} · ${image.provider}` : image.provider}
              </p>
            </div>
          </a>
        ))}
      </div>
      )}
    </>
  );
}

function QueryPills({
  queries,
  activeQuery,
  onSelect,
}: {
  queries: string[];
  activeQuery: string | null;
  onSelect: (query: string | null) => void;
}) {
  const t = useT();
  if (queries.length === 0) return null;

  const pillClass = (active: boolean) =>
    cn(
      'rounded-full border px-3 py-1 text-xs transition-colors',
      active
        ? 'border-primary bg-primary text-primary-foreground'
        : 'border-border bg-muted text-muted-foreground hover:text-foreground',
    );

  return (
    <div className="mb-3 flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={() => onSelect(null)}
        aria-pressed={activeQuery === null}
        className={pillClass(activeQuery === null)}
      >
        {t('label.all_image_queries', { n: queries.length })}
      </button>
      {queries.map((q) => (
        <button
          key={q}
          type="button"
          onClick={() => onSelect(q)}
          aria-pressed={activeQuery === q}
          className={pillClass(activeQuery === q)}
        >
          {q}
        </button>
      ))}
    </div>
  );
}
