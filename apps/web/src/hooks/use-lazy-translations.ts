'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { PYTHON_API_URL } from '@/lib/api-url';
import { logwarn } from '@/lib/logger';

const CHUNK_SIZE = 10;

interface UseLazyTranslationsOptions {
  /** L2 texts, one per line. */
  texts: string[];
  /** Native language code (translation target). */
  l1: string;
  /** Target language code (translation source). */
  l2: string;
  /** Master switch — when false, nothing is fetched or shown. Default true. */
  enabled?: boolean;
  /** Optional per-line highlight terms (parallel to `texts`): a single term or
   *  a list of terms (head + inflected/script forms) — the server bolds every
   *  matching occurrence in the translation (SPEC-021 "Term Emphasis"). */
  forms?: (string | string[] | null | undefined)[];
}

/**
 * Lazily translates a list of lines for a section that stays mounted but may
 * be hidden (e.g. the Corpus pills, which are kept mounted to prefetch).
 *
 * Nothing is fetched until the container scrolls into view (IntersectionObserver)
 * AND `enabled` is true. Chunks are then translated progressively through
 * `/translate_array` (10 lines each), so translations appear a few lines at a
 * time instead of one big blocking request. Backend caching dedupes repeat
 * requests.
 *
 * Returns:
 *  - `translations`: sparse array (undefined = not yet translated)
 *  - `loading`: true while any chunk is in flight
 *  - `containerRef`: attach to the list container so visibility is observed
 */
export function useLazyTranslations({
  texts,
  l1,
  l2,
  enabled = true,
  forms,
}: UseLazyTranslationsOptions) {
  const [translations, setTranslations] = useState<(string | undefined)[]>([]);
  const [loading, setLoading] = useState(false);
  const resultsRef = useRef<(string | undefined)[]>([]);
  const doneChunksRef = useRef<Set<number>>(new Set());
  const startedRef = useRef(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [retryCounter, setRetryCounter] = useState(0);

  const totalChunks = texts.length === 0 ? 0 : Math.ceil(texts.length / CHUNK_SIZE);

  // Reset only when the line CONTENT changes — a new array identity with the
  // same joined content (e.g. a parent re-render) keeps existing translations
  // instead of clearing them (avoids flash-then-disappear).
  const textsKeyRef = useRef<string>('');
  useEffect(() => {
    const key = texts.join('\u0000');
    if (key === textsKeyRef.current) return;
    textsKeyRef.current = key;
    resultsRef.current = new Array(texts.length);
    doneChunksRef.current = new Set();
    startedRef.current = false;
    setTranslations([]);
    setLoading(false);
  }, [texts]);

  // Observe the container — start translating once it becomes visible.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !enabled || texts.length === 0 || startedRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          startedRef.current = true;
          setRetryCounter((c) => c + 1);
          observer.disconnect();
        }
      },
      { rootMargin: '300px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [enabled, texts.length]);

  // Translate all chunks progressively (visible-triggered).
  useEffect(() => {
    if (!enabled || texts.length === 0 || !startedRef.current) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const run = async () => {
      setLoading(true);
      for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
        if (controller.signal.aborted) break;
        if (doneChunksRef.current.has(chunkIdx)) continue;

        const start = chunkIdx * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, texts.length);
        const chunk = texts.slice(start, end);

        try {
          const res = await fetch(`${PYTHON_API_URL}/translate_array`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              texts: chunk,
              l1,
              l2,
              ...(forms ? { forms: chunk.map((_, i) => forms[start + i] ?? null) } : {}),
            }),
            signal: controller.signal,
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          const translated: string[] = data.translated_texts ?? [];
          if (translated.length < chunk.length) {
            logwarn(
              `[LP Web] Corpus translation chunk ${chunkIdx}: expected ${chunk.length}, got ${translated.length}`,
            );
            break; // stop rather than misalign
          }
          for (let i = 0; i < translated.length; i++) {
            resultsRef.current[start + i] = translated[i];
          }
          doneChunksRef.current.add(chunkIdx);
          setTranslations([...resultsRef.current]);
        } catch (err: any) {
          if (err?.name === 'AbortError' || controller.signal.aborted) break;
          logwarn('[LP Web] Corpus translation chunk failed', err);
          break; // stop — don't hammer the server
        }
      }
      if (!controller.signal.aborted) setLoading(false);
    };

    run();
    return () => controller.abort();
  }, [enabled, texts, l1, l2, forms, totalChunks, retryCounter]);

  const retry = useCallback(() => setRetryCounter((c) => c + 1), []);

  return { translations, loading, containerRef, retry };
}
