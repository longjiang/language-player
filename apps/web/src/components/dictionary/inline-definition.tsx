'use client';

import { useState, useEffect, useRef } from 'react';
import { baseCode } from '@/lib/language-data';
import { PYTHON_API_URL } from '@/lib/api-url';
import { decomposeWordId } from '@langplayer/shared';

// ── Definition cache (module-level, lives for the lifetime of the page) ──
const definitionCache = new Map<string, { definition: string; pronunciation: string; partOfSpeech?: string } | null>();

export async function fetchDefinition(
  wordId: string,
  l1Code: string,
  l2Code: string,
): Promise<{ definition: string; pronunciation: string; partOfSpeech?: string } | null> {
  if (definitionCache.has(wordId)) return definitionCache.get(wordId) ?? null;

  const decomposed = decomposeWordId(wordId, l2Code);
  if (!decomposed) { definitionCache.set(wordId, null); return null; }

  const url = `${PYTHON_API_URL}/dictionary/entry?l2=${baseCode(l2Code)}&dict=${decomposed.dict}&id=${encodeURIComponent(decomposed.id)}&l1=${baseCode(l1Code)}`;

  try {
    const res = await fetch(url);
    if (!res.ok) { definitionCache.set(wordId, null); return null; }
    const data = await res.json();
    const entry = data.entry;
    const result = {
      definition: (entry?.definitions?.[0] as string) ?? '',
      pronunciation: (entry?.pronunciation as string) ?? '',
      partOfSpeech: (entry?.part_of_speech as string) ?? undefined,
    };
    definitionCache.set(wordId, result);
    return result;
  } catch {
    definitionCache.set(wordId, null);
    return null;
  }
}

/**
 * Fetches the first definition + pronunciation from the Python backend
 * only when the row scrolls into the viewport. Results are cached in a
 * module-level Map so scrolling back doesn't re-fetch.
 *
 * Renders an invisible sentinel <span> until the row is near the viewport
 * (300px pre-load margin), then swaps in the definition text once loaded.
 */
export function InlineDefinition({
  wordId,
  l1Code,
  l2Code,
}: {
  wordId: string;
  l1Code: string;
  l2Code: string;
}) {
  const [def, setDef] = useState<{ definition: string; pronunciation: string; partOfSpeech?: string } | null | undefined>(
    () => definitionCache.get(wordId),
  );
  const sentinelRef = useRef<HTMLSpanElement>(null);
  const fetchedRef = useRef(def !== undefined);

  useEffect(() => {
    // Already cached (from constructor or a previous row)
    if (definitionCache.has(wordId)) {
      setDef(definitionCache.get(wordId) ?? null);
      return;
    }

    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && !fetchedRef.current) {
          fetchedRef.current = true;
          fetchDefinition(wordId, l1Code, l2Code).then((result) => {
            setDef(result);
          });
          observer.disconnect();
        }
      },
      { rootMargin: '300px' },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [wordId, l1Code, l2Code]);

  // Not yet resolved (still outside viewport, not yet fetched)
  if (def === undefined) {
    return <span ref={sentinelRef} className="block h-4" />;
  }

  // Fetched but no data
  if (!def || (!def.definition && !def.pronunciation)) {
    return <span className="block h-0.5" />;
  }

  return (
    <p className="mt-0.5 truncate text-xs text-muted-foreground/80">
      {def.pronunciation && (
        <span className="mr-1.5 text-muted-foreground/50">{def.pronunciation}</span>
      )}
      {def.partOfSpeech && (
        <span className="mr-1 text-muted-foreground/50 italic">{def.partOfSpeech}</span>
      )}
      {def.definition && <span>{def.definition}</span>}
    </p>
  );
}
