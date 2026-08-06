'use client';

import { useEffect, useState } from 'react';
import { logwarn } from '@/lib/logger';

/**
 * Minimal fetch wrapper for the unauthenticated Flask `/sketch-engine/*`
 * endpoints (see docs/arch/020-sketch-engine-architecture.md). Mirrors the
 * direct `fetch(PYTHON_API_URL + ...)` pattern used by subs-search-results
 * and image-search-results — these endpoints need no auth token.
 *
 * Pass `null` for url to skip fetching (e.g. while a section is disabled).
 */
export function useCorpusFetch<T>(url: string | null) {
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
        logwarn('[LP Web] Sketch Engine fetch failed', url, err);
        setError(err instanceof Error ? err.message : String(err));
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
