import { useEffect, useRef, useState } from 'react';
import { PYTHON_API_URL } from '@/lib/api-url';
import { logwarn } from '@/lib/logger';

/**
 * Lazily translate a list of L2 texts to L1 via POST /translate.
 * Translates texts that aren't cached, sequentially, and exposes a
 * translations array aligned with the input texts. Used by the corpus
 * sections (collocations, examples) — mirrors web's useLazyTranslations
 * without the IntersectionObserver (mobile sections render on mount).
 */
export function useCorpusTranslations(texts: string[], l1: string, l2: string) {
  const [translations, setTranslations] = useState<(string | undefined)[]>([]);
  const cacheRef = useRef<Map<string, string>>(new Map());
  const doneRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (texts.length === 0) {
      setTranslations([]);
      return;
    }
    let cancelled = false;

    const translateOne = async (index: number, text: string): Promise<void> => {
      if (cancelled || doneRef.current.has(index)) return;
      doneRef.current.add(index);
      const cached = cacheRef.current.get(text);
      if (cached !== undefined) {
        if (!cancelled) {
          setTranslations((prev) => {
            const next = [...prev];
            next[index] = cached;
            return next;
          });
        }
        return;
      }
      try {
        const res = await fetch(`${PYTHON_API_URL}/translate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, l1, l2 }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const raw = data?.translated_text ?? data?.translation ?? data?.text;
        if (typeof raw === 'string' && raw) {
          cacheRef.current.set(text, raw);
          if (!cancelled) {
            setTranslations((prev) => {
              const next = [...prev];
              next[index] = raw;
              return next;
            });
          }
        }
      } catch (err) {
        logwarn('[LP Mobile] corpus translate failed', text, err);
      }
    };

    (async () => {
      for (let i = 0; i < texts.length; i++) {
        await translateOne(i, texts[i]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [texts, l1, l2]);

  return { translations };
}
