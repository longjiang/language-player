import { useEffect, useRef, useState, useCallback } from 'react';
import { PYTHON_API_URL } from '@/lib/api-url';
import { logwarn } from '@/lib/logger';

const CHUNK_SIZE = 10;

/**
 * Lazily translate a list of L2 texts to L1 in chunks via /translate_array.
 *
 * Mirrors web's useLazyTranslations:
 *  - only translates when `visible` is true (set from the container's onLayout);
 *  - translates chunk by chunk so results appear progressively;
 *  - aborts and resets when the texts/forms change.
 */
export function useCorpusTranslations(
  texts: string[],
  l1: string,
  l2: string,
  forms?: (string[] | string | null | undefined)[],
  visible = true,
) {
  const [translations, setTranslations] = useState<(string | undefined)[]>([]);
  const [loading, setLoading] = useState(false);
  const [retryCounter, setRetryCounter] = useState(0);
  const cacheRef = useRef<Map<string, string>>(new Map());
  const doneRef = useRef<Set<number>>(new Set());
  const abortRef = useRef<AbortController | null>(null);

  const textsKey = texts.join('\u0000');
  const formsKey = (forms ?? [])
    .map((f) => (Array.isArray(f) ? f.join(',') : (f ?? '')))
    .join('\u0000');

  // Reset when the line content changes (not on array identity).
  useEffect(() => {
    cacheRef.current = new Map();
    doneRef.current = new Set();
    setTranslations(new Array(texts.length));
    setLoading(false);
  }, [textsKey, formsKey, texts.length]);

  const retry = useCallback(() => setRetryCounter((c) => c + 1), []);

  useEffect(() => {
    if (!visible || texts.length === 0) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const run = async () => {
      setLoading(true);
      const totalChunks = Math.ceil(texts.length / CHUNK_SIZE);
      for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
        if (controller.signal.aborted) break;
        if (doneRef.current.has(chunkIdx)) continue;

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
              ...(forms
                ? { forms: chunk.map((_, i) => forms[start + i] ?? null) }
                : {}),
            }),
            signal: controller.signal,
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);

          const data = await res.json();
          const translated: string[] = data.translated_texts ?? [];
          if (translated.length < chunk.length) {
            logwarn(`Corpus translation chunk ${chunkIdx}: expected ${chunk.length}, got ${translated.length}`);
            break;
          }

          setTranslations((prev) => {
            const next = [...prev];
            for (let i = 0; i < translated.length; i++) {
              const idx = start + i;
              next[idx] = translated[i]!;
              cacheRef.current.set(`${texts[idx]}\u0000${formsKey}`, translated[i]!);
            }
            return next;
          });
          doneRef.current.add(chunkIdx);
        } catch (err: any) {
          if (err?.name === 'AbortError' || controller.signal.aborted) break;
          logwarn('Corpus translation chunk failed', err);
          break;
        }
      }
      if (!controller.signal.aborted) setLoading(false);
    };

    run();
    return () => controller.abort();
  }, [visible, textsKey, formsKey, texts.length, l1, l2, retryCounter]);

  return { translations, loading, retry };
}
