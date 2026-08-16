import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, Image } from 'react-native';
import { Pressable } from '@/components/ui/pressable';
import { useT } from '@/hooks/use-t';
import { PYTHON_API_URL } from '@/lib/api-url';
import { ErrorNotice } from '@/components/ui/error-notice';
import { ImageOff, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { ICON_MUTED } from '@/lib/theme-colors';

// Openverse is the direct image source (matches web / ADR-0024): stable JSON
// API with CC-license metadata. LLM-rewritten query polyfill runs through Flask.
const OPENVERSE_IMAGES_URL = 'https://api.openverse.org/v1/images/';
const PAGE_SIZE = 20;
const OWNER_MAX_IMAGES = 2;

export interface SearchImage {
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

// ── In-memory caches (session) ──
const searchCache = new Map<string, SearchImage[]>();
const llmQueryCache = new Map<string, string[]>();

function getSearchCache(query: string): SearchImage[] | undefined {
  return searchCache.get(query);
}
function setSearchCache(query: string, results: SearchImage[]) {
  searchCache.set(query, results);
}

/** Base ISO 639-1 code (zh-Hans → zh). */
function baseCode(code: string): string {
  return code.split('-')[0]!;
}

/** Latin-script terms get the target language's native name appended to
 *  disambiguate (e.g. "chat" → French cat vs English small talk). CJK/Cyrillic
 *  terms are language-specific as-is. */
const NON_LATIN_RE = /[^\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}]/u;

function buildImageQuery(term: string, l2Name: string, l2Code: string): string {
  if (baseCode(l2Code) === 'en' || NON_LATIN_RE.test(term)) return term;
  return `${term} ${l2Name}`;
}

/** Same-owner density cap (Flickr-style series). */
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

/** Fetch results for a query, progressively relaxing it when empty. */
async function fetchQueryResults(query: string, signal?: AbortSignal): Promise<SearchImage[]> {
  const words = query.split(/\s+/).filter(Boolean);
  const start = words.length > 2 ? words.length - 1 : words.length;
  for (let i = start; i >= 1; i--) {
    const candidate = words.slice(0, i).join(' ');
    const cached = getSearchCache(candidate);
    if (cached !== undefined) {
      if (cached.length > 0) return cached;
      continue;
    }
    const url = `${OPENVERSE_IMAGES_URL}?q=${encodeURIComponent(candidate)}&page_size=${PAGE_SIZE}&filter_dead=true`;
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { results?: SearchImage[] };
    const results = data.results ?? [];
    setSearchCache(candidate, results);
    if (results.length > 0) return results;
  }
  return [];
}

interface ImageSearchResultsProps {
  term: string;
  l2Code: string;
  /** Localized L2 name — used to disambiguate Latin-script queries. */
  l2Name: string;
  l1Code?: string;
  definition?: string;
  /** Surrounding sentence the word appears in (biases query sense). */
  contextText?: string;
  /** Inflected form of the word as it appears in contextText. */
  contextForm?: string;
  /** 'grid' = full experience (pills, pagination); 'compact' = one
   *  horizontally scrolling row of thumbnails, original term only. */
  variant?: 'grid' | 'compact';
}

/**
 * Openverse image search for a dictionary entry — the mobile equivalent of the
 * web ImageSearchResults (SPEC-049 §3). Grid variant shows query pills (original
 * term + LLM-rewritten queries from Flask) over a paginated 4×3 grid with
 * skeleton loading; compact variant is a horizontal strip for the popup.
 */
export function ImageSearchResults({
  term,
  l2Code,
  l2Name,
  l1Code = 'en',
  definition,
  contextText,
  contextForm,
  variant = 'grid',
}: ImageSearchResultsProps) {
  const t = useT();
  const isCompact = variant === 'compact';
  // Full grid variant is a fixed 4×3 grid (12 tiles per page), matching the
  // web layout. Cells are percentage-width so padding can never overflow.
  const cols = 4;

  const [images, setImages] = useState<SearchImage[] | null>(null);
  const [queries, setQueries] = useState<string[]>([]);
  const [activeQuery, setActiveQuery] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [brokenIds, setBrokenIds] = useState<Set<string>>(new Set());

  const markBroken = useCallback((id: string) => {
    setBrokenIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

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
      const originalQuery = buildImageQuery(term, l2Name, l2Code);
      const llmCacheKey = [l2Code, term, l1Code, definition ?? '', contextText ?? '', contextForm ?? ''].join('|');

      if (isCompact) {
        // Popup dictionary: original term only — no LLM queries, no pills.
        setQueries([originalQuery]);
        let results: SearchImage[] = [];
        try {
          results = await fetchQueryResults(originalQuery, controller.signal);
        } catch {
          if (!cancelled) setError('Openverse image search failed');
        }
        if (!cancelled) {
          setImages(capByOwner(results).slice(0, 20).map((img) => ({ ...img, sourceQuery: originalQuery })));
        }
        return;
      }

      // Grid: original term's results first so the grid paints immediately.
      setQueries([originalQuery]);
      let original: SearchImage[] = [];
      try {
        original = await fetchQueryResults(originalQuery, controller.signal);
      } catch {
        // Original query failed — LLM queries may still succeed below.
      }
      if (cancelled) return;

      const taggedOriginal = capByOwner(original).map((img) => ({ ...img, sourceQuery: originalQuery }));
      if (taggedOriginal.length > 0) setImages(taggedOriginal);

      // LLM-rewritten queries via Flask (cached server-side).
      let searchQueries = llmQueryCache.get(llmCacheKey) ?? [];
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
              if (searchQueries.length > 0) llmQueryCache.set(llmCacheKey, searchQueries);
            }
          }
        } catch {
          // LLM unavailable — original-term results stand on their own.
        }
      }
      if (cancelled) return;

      const seenQuery = new Set([originalQuery.toLowerCase()]);
      const llmQueries = searchQueries.filter((q) => {
        const lower = q.toLowerCase();
        if (seenQuery.has(lower)) return false;
        seenQuery.add(lower);
        return true;
      });
      if (llmQueries.length > 0) setQueries([originalQuery, ...llmQueries]);

      // Polyfill: fetch LLM queries in parallel, append only new results.
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
        } catch {
          failures++;
        }
      }));
      if (cancelled) return;

      if (extra.length > 0) {
        setImages([...taggedOriginal, ...extra]);
      } else if (taggedOriginal.length === 0) {
        if (llmQueries.length > 0 && failures > 0 && failures >= llmQueries.length) {
          setError('Openverse image search failed');
        } else {
          setImages([]);
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [term, l2Code, l2Name, l1Code, definition, contextText, contextForm, isCompact]);

  if (error) {
    return <ErrorNotice message={t('msg.failed_to_load_images')} className="mx-2" />;
  }

  const pageSize = cols * 3;

  // ── Compact strip (popup) ──
  if (isCompact) {
    if (!images) {
      // Skeleton strip
      return (
        <View className="flex-row gap-2 py-1">
          {Array.from({ length: 6 }, (_, i) => (
            <View key={i} className="h-20 w-20 rounded-lg bg-muted" />
          ))}
        </View>
      );
    }
    const good = images.filter((img) => !brokenIds.has(img.id)).slice(0, 10);
    if (good.length === 0) {
      return (
        <View className="items-center justify-center gap-1.5 py-6">
          <ImageOff size={24} color={ICON_MUTED} />
          <Text className="text-xs text-muted-foreground">{t('msg.no_images_found', { term })}</Text>
        </View>
      );
    }
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="py-1">
        <View className="flex-row gap-2">
          {good.map((image) => (
            <ImageTile key={image.id} image={image} term={term} size={80} onBroken={() => markBroken(image.id)} />
          ))}
        </View>
      </ScrollView>
    );
  }

  // ── Grid ──
  if (!images) {
    return (
      <>
        <SkeletonPills />
        <View className="flex-row flex-wrap">
          {Array.from({ length: pageSize }, (_, i) => (
            <View key={i} className="w-1/4 p-1">
              <View className="aspect-square rounded-lg bg-muted" />
            </View>
          ))}
        </View>
      </>
    );
  }

  const visibleImages = activeQuery
    ? images.filter((img) => img.sourceQuery === activeQuery)
    : images;
  const goodImages = visibleImages.filter((img) => !brokenIds.has(img.id));
  const pageCount = Math.max(1, Math.ceil(goodImages.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageImages = goodImages.slice(safePage * pageSize, (safePage + 1) * pageSize);
  const gridCells: (SearchImage | null)[] = Array.from({ length: pageSize }, (_, i) => pageImages[i] ?? null);

  if (images.length === 0) {
    return (
      <>
        <QueryPills queries={queries} activeQuery={activeQuery} onSelect={(q) => { setActiveQuery(q); setPage(0); }} t={t} />
        <View className="items-center justify-center gap-2 py-10">
          <ImageOff size={32} color={ICON_MUTED} />
          <Text className="text-sm text-muted-foreground">{t('msg.no_images_found', { term })}</Text>
        </View>
      </>
    );
  }

  return (
    <>
      <QueryPills queries={queries} activeQuery={activeQuery} onSelect={(q) => { setActiveQuery(q); setPage(0); }} t={t} />

      {/* Grid — full rows with muted placeholders filling the gaps */}
      <View className="flex-row flex-wrap">
        {gridCells.map((img, i) => (
          <View key={img?.id ?? `ph-${i}`} className="w-1/4 p-1">
            {img ? (
              <ImageTile image={img} term={term} fill onBroken={() => markBroken(img.id)} />
            ) : (
              <View className="aspect-square rounded-lg bg-muted" />
            )}
          </View>
        ))}
      </View>

      {/* Pagination */}
      {pageCount > 1 && (
        <View className="mt-3 flex-row items-center justify-center gap-4">
          <Pressable
            onPress={() => setPage((p) => Math.max(0, p - 1))}
            disabled={safePage <= 0}
            className="rounded p-1.5 active:bg-muted disabled:opacity-30"
            accessibilityLabel={t('action.previous')}
          >
            <ChevronLeft size={18} color={ICON_MUTED} />
          </Pressable>
          <Text className="text-xs text-muted-foreground">
            {safePage + 1} / {pageCount}
          </Text>
          <Pressable
            onPress={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            disabled={safePage >= pageCount - 1}
            className="rounded p-1.5 active:bg-muted disabled:opacity-30"
            accessibilityLabel={t('action.next')}
          >
            <ChevronRight size={18} color={ICON_MUTED} />
          </Pressable>
        </View>
      )}
    </>
  );
}

// ── Sub-components ──

function QueryPills({
  queries,
  activeQuery,
  onSelect,
  t,
}: {
  queries: string[];
  activeQuery: string | null;
  onSelect: (q: string | null) => void;
  t: (k: string, vars?: any) => string;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-2">
      <View className="flex-row gap-2 px-2 py-1">
        <Pressable
          onPress={() => onSelect(null)}
          className={`rounded-full px-3 py-1 ${activeQuery === null ? 'bg-primary' : 'bg-muted/60'}`}
        >
          <Text className={`text-xs ${activeQuery === null ? 'text-primary-foreground' : 'text-muted-foreground'}`}>
            {t('label.all_image_queries', { n: queries.length })}
          </Text>
        </Pressable>
        {queries.map((q) => (
          <Pressable
            key={q}
            onPress={() => onSelect(q)}
            className={`rounded-full px-3 py-1 ${activeQuery === q ? 'bg-primary' : 'bg-muted/60'}`}
          >
            <Text className={`text-xs ${activeQuery === q ? 'text-primary-foreground' : 'text-muted-foreground'}`} numberOfLines={1}>
              {q}
            </Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

function SkeletonPills() {
  return (
    <View className="mb-2 flex-row gap-2 px-2 py-1">
      {Array.from({ length: 3 }, (_, i) => (
        <View key={i} className="h-7 w-20 rounded-full bg-muted" />
      ))}
    </View>
  );
}

function ImageTile({
  image,
  term,
  size,
  fill = false,
  onBroken,
}: {
  image: SearchImage;
  term: string;
  size?: number;
  /** Fill the parent cell with an aspect-square tile (grid variant). */
  fill?: boolean;
  onBroken: () => void;
}) {
  const [failed, setFailed] = useState(false);
  const thumb = image.thumbnail;
  const tileStyle = fill
    ? { width: '100%' as const, aspectRatio: 1 }
    : { width: size ?? 80, height: size ?? 80 };
  return (
    <Pressable
      onPress={() => {}}
      style={tileStyle}
      className="overflow-hidden rounded-lg bg-muted"
    >
      {thumb && !failed ? (
        <Image
          source={{ uri: thumb }}
          style={fill ? { width: '100%', height: '100%' } : { width: size ?? 80, height: size ?? 80 }}
          resizeMode="cover"
          onError={() => { setFailed(true); onBroken(); }}
        />
      ) : (
        <View className="flex-1 items-center justify-center">
          <ImageOff size={20} color={ICON_MUTED} />
          <Text className="mt-1 px-1 text-center text-[9px] text-muted-foreground" numberOfLines={2}>
            {term}
          </Text>
        </View>
      )}
    </Pressable>
  );
}
