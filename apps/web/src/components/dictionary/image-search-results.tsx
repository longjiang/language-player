'use client';

import { useEffect, useState } from 'react';
import { useT } from '@/hooks/use-t';
import { baseCode, languageName } from '@/lib/language-data';
import { PYTHON_API_URL } from '@/lib/api-url';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import { AlertCircle, ChevronLeft, ChevronRight, ImageOff, ImageIcon } from 'lucide-react';

// Openverse is the direct image source for the web app (see ADR-0024): it has
// a stable JSON API, CC-license metadata, and server-side dead-thumbnail
// filtering. LLM-generated query polyfill still runs through Flask.
const OPENVERSE_IMAGES_URL = 'https://api.openverse.org/v1/images/';
const PAGE_SIZE = 20;
const OWNER_MAX_IMAGES = 2;
// ── Caches (in-memory + sessionStorage) ──
// Openverse results and LLM queries are stable within a session. The Maps
// make repeat lookups instant; sessionStorage backs them so reloads don't
// redo work either, while expiring naturally when the tab session ends.
const searchCache = new Map<string, SearchImage[]>();
const llmQueryCache = new Map<string, string[]>();

const STORAGE_PREFIX = 'lp:imageSearch:';

function storageGet<T>(key: string): T | undefined {
  try {
    const raw = sessionStorage.getItem(key);
    return raw === null ? undefined : JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

function storageSet(key: string, value: unknown) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota/availability errors must never break the search.
  }
}

function getSearchCache(query: string): SearchImage[] | undefined {
  if (searchCache.has(query)) return searchCache.get(query);
  const stored = storageGet<SearchImage[]>(`${STORAGE_PREFIX}results:${query}`);
  if (stored !== undefined) searchCache.set(query, stored);
  return stored;
}

function setSearchCache(query: string, results: SearchImage[]) {
  searchCache.set(query, results);
  storageSet(`${STORAGE_PREFIX}results:${query}`, results);
}

function getLlmCache(key: string): string[] | undefined {
  if (llmQueryCache.has(key)) return llmQueryCache.get(key);
  const stored = storageGet<string[]>(`${STORAGE_PREFIX}queries:${key}`);
  if (stored !== undefined) llmQueryCache.set(key, stored);
  return stored;
}

function setLlmCache(key: string, queries: string[]) {
  llmQueryCache.set(key, queries);
  storageSet(`${STORAGE_PREFIX}queries:${key}`, queries);
}

interface SearchImage {
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
 * Same-owner density cap: Flickr-style URLs expose the uploader account, so a
 * single photographer's series (e.g. 13 shots from one Sky Deck visit) can
 * otherwise dominate a query's results. Keep at most OWNER_MAX_IMAGES per
 * identifiable owner. Images with no identifiable owner are never capped.
 */
function ownerKey(img: SearchImage): string {
  const m = img.foreign_landing_url?.match(/\/photos\/([^/]+)\/\d+/);
  if (m) return `${img.provider}:${m[1]}`;
  if (img.creator) return `${img.provider}:${img.creator.toLowerCase()}`;
  return `unique:${img.id}`;
}

function capByOwner(images: SearchImage[]): SearchImage[] {
  const counts = new Map<string, number>();
  const out: SearchImage[] = [];
  for (const img of images) {
    const key = ownerKey(img);
    const count = counts.get(key) ?? 0;
    if (count >= OWNER_MAX_IMAGES) continue;
    counts.set(key, count + 1);
    out.push(img);
  }
  return out;
}

/**
 * Fetch results for a query, progressively relaxing it when it comes back
 * empty. Openverse matches metadata literally, so poetic multi-word queries
 * ("Mount Fuji painting shining brilliantly") often return nothing — dropping
 * trailing words ("Mount Fuji painting" → "Mount Fuji") finds real matches.
 * Relaxed results are still tagged with the original query for the pills.
 */
async function fetchQueryResults(query: string, signal: AbortSignal): Promise<SearchImage[]> {
  const words = query.split(/\s+/).filter(Boolean);
  // Try the relaxed variant first: LLM queries often end in words like
  // "substance" or "compound" that rarely appear in captions, so the full
  // string usually comes back empty anyway — skip it and save a call. The
  // ladder below still drops more words if the relaxed variant is also empty.
  const start = words.length > 2 ? words.length - 1 : words.length;
  for (let i = start; i >= 1; i--) {
    const candidate = words.slice(0, i).join(' ');
    const cached = getSearchCache(candidate);
    if (cached !== undefined) {
      if (cached.length > 0) return cached;
      continue; // known empty — try a shorter candidate
    }
    const url = `${OPENVERSE_IMAGES_URL}?q=${encodeURIComponent(candidate)}&page_size=${PAGE_SIZE}&filter_dead=true`;
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as { results?: SearchImage[] };
    const results = data.results ?? [];
    setSearchCache(candidate, results);
    if (results.length > 0) {
      return results;
    }
  }
  return [];
}

export function ImageSearchResults({
  term,
  l2Code,
  l1Code = 'en',
  definition,
  contextText,
  contextForm,
  variant = 'grid',
}: {
  term: string;
  l2Code: string;
  l1Code?: string;
  definition?: string;
  /** Surrounding sentence the word appears in (biases query sense). */
  contextText?: string;
  /** Inflected form of the word as it appears in contextText. */
  contextForm?: string;
  /** 'grid' = full experience (pills, pagination); 'compact' = one
   *  horizontally scrolling row of 10 thumbnails, original term only,
   *  no pills. */
  variant?: 'grid' | 'compact';
}) {
  const t = useT();
  const isCompact = variant === 'compact';
  const [images, setImages] = useState<SearchImage[] | null>(null);
  const [queries, setQueries] = useState<string[]>([]);
  const [activeQuery, setActiveQuery] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [cols, setCols] = useState(3);
  const [error, setError] = useState<string | null>(null);
  const [brokenIds, setBrokenIds] = useState<Set<string>>(new Set());

  // Broken thumbnails are removed from the pool, so the next good image from
  // the query's results slides in to fill the gap.
  const markBroken = (id: string) => {
    setBrokenIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setImages(null);
    setError(null);
    setQueries([]);
    setActiveQuery(null);
    setPage(0);
    setBrokenIds(new Set());

    const run = async () => {
      const originalQuery = buildImageQuery(term, l2Code);
      const llmCacheKey = [l2Code, term, l1Code, definition ?? '', contextText ?? '', contextForm ?? ''].join('|');

      if (isCompact) {
        // Popup dictionary: search the original term only — no LLM queries,
        // no pills. A small strip of thumbnails is enough for a visual idea.
        setQueries([originalQuery]);
        let results: SearchImage[] = [];
        try {
          results = await fetchQueryResults(originalQuery, controller.signal);
        } catch (err: any) {
          if (err?.name !== 'AbortError') setError('Openverse image search failed');
        }
        if (!cancelled) {
          // A strip of 10 thumbnails is enough for a visual idea in the popup.
          // Keep a reserve pool so broken tiles can be replaced with good
          // ones (10 are shown at a time).
          setImages(capByOwner(results).slice(0, 20).map((img) => ({ ...img, sourceQuery: originalQuery })));
        }
        return;
      }

      // Grid (dictionary tabs): load the original term's results first so the
      // grid paints immediately, then polyfill with the LLM-rewritten queries.
      setQueries([originalQuery]);
      let original: SearchImage[] = [];
      try {
        original = await fetchQueryResults(originalQuery, controller.signal);
      } catch {
        // Original query failed — the LLM queries may still succeed below.
      }
      if (cancelled) return;

      const taggedOriginal = capByOwner(original).map((img) => ({ ...img, sourceQuery: originalQuery }));
      if (taggedOriginal.length > 0) setImages(taggedOriginal);

      // Ask the backend for LLM-rewritten queries (cached server-side).
      let searchQueries = getLlmCache(llmCacheKey) ?? [];
      if (searchQueries.length === 0) {
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
              if (searchQueries.length > 0) setLlmCache(llmCacheKey, searchQueries);
            }
          }
        } catch {
          // LLM unavailable — the original-term results stand on their own.
        }
      }
      if (cancelled) return;

      // Dedupe case-insensitively (the LLM may echo the original term).
      const seenQuery = new Set([originalQuery.toLowerCase()]);
      const llmQueries = searchQueries.filter((q) => {
        const lower = q.toLowerCase();
        if (seenQuery.has(lower)) return false;
        seenQuery.add(lower);
        return true;
      });
      if (llmQueries.length > 0) setQueries([originalQuery, ...llmQueries]);

      // Polyfill: fetch the LLM queries in parallel and append only results
      // that aren't already shown, so the original term stays first.
      const extra: SearchImage[] = [];
      const seen = new Set(
        taggedOriginal.map((img) => (img.foreign_landing_url ?? img.url ?? img.id).replace(/[?#].*$/, '')),
      );
      let failures = 0;

      await Promise.all(llmQueries.map(async (q) => {
        try {
          const results = await fetchQueryResults(q, controller.signal);
          for (const img of capByOwner(results)) {
            const key = (img.foreign_landing_url ?? img.url ?? img.id).replace(/[?#].*$/, '');
            if (!seen.has(key)) {
              seen.add(key);
              extra.push({ ...img, sourceQuery: q });
            }
          }
        } catch (err: any) {
          if (err?.name !== 'AbortError') failures++;
        }
      }));
      if (cancelled) return;

      if (extra.length > 0) {
        setImages([...taggedOriginal, ...extra]);
      } else if (taggedOriginal.length === 0) {
        if (llmQueries.length > 0 && failures > 0 && failures >= llmQueries.length) {
          setError('Openverse image search failed');
        } else {
          setImages([]); // nothing found for any query
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
      <div className="space-y-3">
        <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {t('msg.failed_to_load_images')}
        </div>
        {/* Manual Google Images fallback — same button/logic as the popup
            dictionary (opens in a new tab). */}
        {!isCompact && <SearchImagesButton term={term} />}
      </div>
    );
  }

  const pageSize = cols * 3;

  if (!images) {
    if (isCompact) return <SkeletonStrip />;
    return (
      <>
        <SkeletonPills />
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" aria-hidden>
          {Array.from({ length: pageSize }, (_, i) => (
            <div
              key={i}
              className="aspect-square animate-pulse rounded-lg border border-border bg-muted"
            />
          ))}
        </div>
      </>
    );
  }

  if (isCompact) {
    const good = images.filter((img) => !brokenIds.has(img.id)).slice(0, 10);
    return good.length === 0 ? (
      <div className="flex flex-col items-center justify-center gap-1.5 py-8 text-center">
        <ImageOff className="h-6 w-6 text-muted-foreground/50" />
        <p className="text-xs text-muted-foreground">{t('msg.no_images_found', { term })}</p>
      </div>
    ) : (
      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {good.map((image) => (
          <ImageTile
            key={image.id}
            image={image}
            term={term}
            className="h-24 w-24 flex-shrink-0 sm:h-28 sm:w-28"
            onBroken={() => markBroken(image.id)}
          />
        ))}
      </div>
    );
  }

  const visibleImages = activeQuery
    ? images.filter((img) => img.sourceQuery === activeQuery)
    : images;
  const goodImages = visibleImages.filter((img) => !brokenIds.has(img.id));
  const pageCount = Math.max(1, Math.ceil(goodImages.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageImages = goodImages.slice(safePage * pageSize, (safePage + 1) * pageSize);
  // Always render a full three rows — muted placeholders fill the gaps so the
  // grid never shifts between pages or states.
  const gridCells: (SearchImage | null)[] = Array.from(
    { length: pageSize },
    (_, i) => pageImages[i] ?? null,
  );

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
        {/* Manual Google Images fallback — same button/logic as the popup
            dictionary (opens in a new tab). */}
        {!isCompact && <SearchImagesButton term={term} className="mt-3" />}
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
          {gridCells.map((image, i) =>
            image ? (
              <ImageTile
                key={image.id}
                image={image}
                term={term}
                className="aspect-square"
                onBroken={() => markBroken(image.id)}
              />
            ) : (
              <div
                key={`placeholder-${i}`}
                aria-hidden
                className="aspect-square rounded-lg border border-border bg-muted/50"
              />
            ),
          )}
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

        {/* Search Google Images — below the gallery, same button/logic as the
            popup dictionary (opens in a new tab). */}
        {!isCompact && <SearchImagesButton term={term} className="mt-3" />}
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

function SkeletonPills() {
  return (
    <div
      aria-hidden
      className="mb-3 flex flex-nowrap items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <div className="h-6 w-24 flex-shrink-0 animate-pulse rounded-full bg-muted" />
      <div className="h-6 w-32 flex-shrink-0 animate-pulse rounded-full bg-muted" />
      <div className="h-6 w-28 flex-shrink-0 animate-pulse rounded-full bg-muted" />
      <div className="h-6 w-36 flex-shrink-0 animate-pulse rounded-full bg-muted" />
    </div>
  );
}

function SkeletonStrip() {
  return (
    <div
      aria-hidden
      className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {Array.from({ length: 12 }, (_, i) => (
        <div
          key={i}
          className="h-24 w-24 flex-shrink-0 animate-pulse rounded-lg border border-border bg-muted sm:h-28 sm:w-28"
        />
      ))}
    </div>
  );
}

function ImageTile({
  image,
  term,
  className,
  onBroken,
}: {
  image: SearchImage;
  term: string;
  className?: string;
  onBroken: () => void;
}) {
  return (
    <a
      href={image.foreign_landing_url ?? image.url}
      target="_blank"
      rel="noopener noreferrer"
      title={image.attribution || image.title}
      className={cn(
        'group relative block overflow-hidden rounded-lg border border-border bg-muted',
        className,
      )}
    >
      {image.thumbnail ?? image.url ? (
        // The backend returns direct image URLs; clicking opens the source page.
        <img
          src={image.thumbnail ?? image.url}
          alt={image.title || term}
          loading="lazy"
          // Backend results are unfiltered, so some thumbnails 403/404 —
          // report the failure so the parent can drop this tile and fill
          // the slot with the next good image.
          onError={onBroken}
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
  );
}

/** "Search Images" — opens Google Images for the term in a new tab. Mirrors
 *  the popup dictionary's button (outline variant + image icon + label),
 *  shown below the gallery as a manual fallback. */
function SearchImagesButton({ term, className }: { term: string; className?: string }) {
  const t = useT();
  return (
    <a
      href={`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(term)}`}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'w-full', className)}
      title={t('action.search_images')}
    >
      <ImageIcon className="h-4 w-4" />
      {t('action.search_images')}
    </a>
  );
}
