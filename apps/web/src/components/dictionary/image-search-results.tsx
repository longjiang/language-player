'use client';

import { useEffect, useState } from 'react';
import { useT } from '@/hooks/use-t';
import { baseCode, languageName } from '@/lib/language-data';
import { PYTHON_API_URL } from '@/lib/api-url';
import { cn } from '@/lib/utils';
import { log } from '@/lib/logger';
import { AlertCircle, ChevronLeft, ChevronRight, ImageOff, Loader2 } from 'lucide-react';

const OPENVERSE_IMAGES_URL = 'https://api.openverse.org/v1/images/';
const PAGE_SIZE = 20;
const THUMBNAIL_TIMEOUT_MS = 5000;
const OWNER_MAX_IMAGES = 2;

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

/**
 * Fetch results for a query, progressively relaxing it when it comes back
 * empty. Openverse matches metadata literally, so poetic multi-word queries
 * ("Mount Fuji painting shining brilliantly") often return nothing — dropping
 * trailing words ("Mount Fuji painting" → "Mount Fuji") finds real matches.
 * Relaxed results are still tagged with the original query for the pills.
 */
async function fetchQueryResults(query: string, signal: AbortSignal): Promise<OpenverseImage[]> {
  const words = query.split(/\s+/).filter(Boolean);
  for (let i = words.length; i >= 1; i--) {
    const candidate = words.slice(0, i).join(' ');
    const url = `${OPENVERSE_IMAGES_URL}?q=${encodeURIComponent(candidate)}&page_size=${PAGE_SIZE}&filter_dead=true`;
    log('[ImageSearch] Openverse fetch:', candidate, url);
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as OpenverseResponse;
    const results = data.results ?? [];
    if (results.length > 0) {
      if (candidate !== query) log('[ImageSearch] Query relaxed:', query, '→', candidate);
      return results;
    }
  }
  return [];
}

/**
 * Same-owner density cap: Flickr-style URLs expose the uploader account, so a
 * single photographer's series (e.g. 13 shots from one Sky Deck visit) can
 * otherwise dominate the grid. Keep at most OWNER_MAX_IMAGES per identifiable
 * owner. Images with no identifiable owner are never capped.
 */
function ownerKey(img: OpenverseImage): string {
  const m = img.foreign_landing_url?.match(/\/photos\/([^/]+)\/\d+/);
  if (m) return `${img.provider}:${m[1]}`;
  if (img.creator) return `${img.provider}:${img.creator.toLowerCase()}`;
  return `unique:${img.id}`;
}

function capByOwner(images: OpenverseImage[]): OpenverseImage[] {
  const counts = new Map<string, number>();
  const out: OpenverseImage[] = [];
  for (const img of images) {
    const key = ownerKey(img);
    const count = counts.get(key) ?? 0;
    if (count >= OWNER_MAX_IMAGES) continue;
    counts.set(key, count + 1);
    out.push(img);
  }
  return out;
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
  const [page, setPage] = useState(0);
  const [cols, setCols] = useState(3);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setImages(null);
    setError(null);
    setQueries([]);
    setActiveQuery(null);
    setPage(0);

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
        try {
          const results = await fetchQueryResults(q, controller.signal);
          for (const img of results) {
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
          // Cap same-owner density, then prune dead thumbnails before showing.
          const capped = capByOwner(merged);
          if (capped.length < merged.length) {
            log('[ImageSearch] Owner-capped:', merged.length - capped.length, 'images removed');
          }
          const pruned = (
            await Promise.all(capped.map((img) => sniffThumbnail(img, controller.signal)))
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

  // Track the grid column count (3 on mobile, 4 from sm up) so each page is
  // exactly three rows tall.
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 640px)');
    const update = () => setCols(mq.matches ? 4 : 3);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

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
  const pageSize = cols * 3;
  const pageCount = Math.max(1, Math.ceil(visibleImages.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageImages = visibleImages.slice(safePage * pageSize, (safePage + 1) * pageSize);

  const handleSelectQuery = (q: string | null) => {
    setActiveQuery(q);
    setPage(0);
  };

  if (images.length === 0) {
    return (
      <>
        <QueryPills queries={queries} activeQuery={activeQuery} onSelect={handleSelectQuery} />
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
          <ImageOff className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">{t('msg.no_images_found', { term })}</p>
        </div>
      </>
    );
  }

  return (
    <>
      <QueryPills queries={queries} activeQuery={activeQuery} onSelect={handleSelectQuery} />
      {visibleImages.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
          <ImageOff className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            {t('msg.no_images_found', { term: activeQuery ?? term })}
          </p>
        </div>
      ) : (
      <>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {pageImages.map((image) => (
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

        {pageCount > 1 && (
          <div className="mt-3 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => setPage(Math.max(0, safePage - 1))}
              disabled={safePage === 0}
              aria-label={t('action.previous_chapter')}
              className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-1.5">
              {Array.from({ length: pageCount }, (_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setPage(i)}
                  aria-label={`${t('action.go_to_page')} ${i + 1}`}
                  aria-current={i === safePage}
                  className={cn(
                    'h-1.5 rounded-full transition-all',
                    i === safePage
                      ? 'w-4 bg-primary'
                      : 'w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/60',
                  )}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => setPage(Math.min(pageCount - 1, safePage + 1))}
              disabled={safePage >= pageCount - 1}
              aria-label={t('action.next')}
              className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </>
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
    <div className="mb-3 flex flex-nowrap items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <button
        type="button"
        onClick={() => onSelect(null)}
        aria-pressed={activeQuery === null}
        className={cn(pillClass(activeQuery === null), 'flex-shrink-0 whitespace-nowrap')}
      >
        {t('label.all_image_queries', { n: queries.length })}
      </button>
      {queries.map((q) => (
        <button
          key={q}
          type="button"
          onClick={() => onSelect(q)}
          aria-pressed={activeQuery === q}
          className={cn(pillClass(activeQuery === q), 'flex-shrink-0 whitespace-nowrap')}
        >
          {q}
        </button>
      ))}
    </div>
  );
}
