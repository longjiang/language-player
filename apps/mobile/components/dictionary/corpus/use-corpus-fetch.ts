import { useEffect, useState } from 'react';
import { logwarn } from '@/lib/logger';
import { useT } from '@/hooks/use-t';
import { localizedError } from '@/lib/errors';

/**
 * Minimal fetch wrapper for the unauthenticated Flask `/sketch-engine/*`
 * endpoints (see docs/arch/020-sketch-engine-architecture.md). These
 * endpoints need no auth token, so a plain fetch is used (matches web).
 *
 * Pass `null` for url to skip fetching.
 */
export function useCorpusFetch<T>(url: string | null) {
  const t = useT();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (url === null) {
      setLoading(false);
      setError(null);
      setData(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);

    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as T;
        if (cancelled) return;
        setData(json);
      } catch (err) {
        if (cancelled) return;
        logwarn('[LP Mobile] Sketch Engine fetch failed', url, err);
        setError(localizedError(t, err, 'error.general'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [url]);

  return { data, loading, error };
}
