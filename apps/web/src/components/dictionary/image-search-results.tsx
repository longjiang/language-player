'use client';

import { useEffect, useMemo, useState } from 'react';
import { useT } from '@/hooks/use-t';
import { baseCode, languageName } from '@/lib/language-data';
import { AlertCircle, ImageOff, Loader2 } from 'lucide-react';

const OPENVERSE_IMAGES_URL = 'https://api.openverse.org/v1/images/';
const PAGE_SIZE = 20;

interface OpenverseImage {
  id: string;
  title: string;
  thumbnail: string | null;
  url: string;
  foreign_landing_url: string | null;
  creator: string | null;
  provider: string;
  attribution: string;
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

export function ImageSearchResults({ term, l2Code }: { term: string; l2Code: string }) {
  const t = useT();
  const [images, setImages] = useState<OpenverseImage[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(() => buildImageQuery(term, l2Code), [term, l2Code]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setImages(null);
    setError(null);

    const url = `${OPENVERSE_IMAGES_URL}?q=${encodeURIComponent(query)}&page_size=${PAGE_SIZE}&filter_dead=true`;

    fetch(url, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<OpenverseResponse>;
      })
      .then((data) => {
        if (!cancelled) setImages(data.results ?? []);
      })
      .catch((err: any) => {
        if (!cancelled && err?.name !== 'AbortError') {
          setError(err?.message ?? 'Openverse request failed');
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [query]);

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

  if (images.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
        <ImageOff className="h-8 w-8 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">{t('msg.no_images_found', { term })}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {images.map((image) => (
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
  );
}
