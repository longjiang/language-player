'use client';

import { useEffect, useState } from 'react';
import { logwarn } from '@/lib/logger';

/**
 * Turn a failed `/sketch-engine/*` response into a message worth showing.
 *
 * The Flask endpoints now answer **503** with `{error, reason}` when the server
 * cannot choose a corpus (no API keys configured, corpus list unreachable, or
 * no corpus for the language) and **502** when Sketch Engine itself returned
 * nothing usable. Rendering that reason — instead of a bare `HTTP 503` — is
 * what makes a local corpus failure diagnosable (ARCH-020 §3.1).
 */
async function describeFailure(res: Response): Promise<string> {
  const base = `HTTP ${res.status}`;
  try {
    const body = (await res.json()) as { error?: unknown; reason?: unknown };
    if (typeof body?.error === 'string' && body.error) return `${base}: ${body.error}`;
    if (typeof body?.reason === 'string' && body.reason) return `${base} (${body.reason})`;
  } catch {
    // Non-JSON error body (proxy/HTML error page) — the status is all we have.
  }
  return base;
}

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
        if (!res.ok) throw new Error(await describeFailure(res));
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
