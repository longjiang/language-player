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
export function useCorpusTranslations(
  texts: string[],
  l1: string,
  l2: string,
  forms?: (string[] | string | null | undefined)[],
) {
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
      const rawForm = forms?.[index];
      const formKey = Array.isArray(rawForm) ? rawForm.join(',') : (rawForm ?? '');
      const cacheKey = `${text}\u0000${formKey}`;
      const cached = cacheRef.current.get(cacheKey);
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
        // Use /translate_array even for a single line so multiple highlight
        // forms are supported, matching web's corpus translation pipeline.
        const res = await fetch(`${PYTHON_API_URL}/translate_array`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            texts: [text],
            l1,
            l2,
            ...(forms ? { forms: [forms[index] ?? null] } : {}),
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const raw = data?.translated_texts?.[0] ?? data?.translated_text ?? data?.translation;
        if (typeof raw === 'string' && raw) {
          cacheRef.current.set(cacheKey, raw);
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
