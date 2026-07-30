/**
 * useBatchLemmatize — hook for lazily fetching and caching lemmatized tokens.
 *
 * Each TokenizedLine component calls getTokens() to check the cache.
 * Uncached texts are collected and fetched in batches via
 * POST /lemmatize-normalized/batch, debounced to coalesce lines
 * that become visible within the same frame.
 *
 * This mirrors the pattern used by useTranslateLines for translations.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import type { LemmatizedToken } from '@langplayer/shared';
import { baseCode } from '@langplayer/utils';

// ── Module-level cache (shared across all hook instances) ──────────────────

const tokenCache = new Map<string, LemmatizedToken[]>();

/** In-flight request deduplication — keyed by cache key, maps to a promise. */
const inflightMap = new Map<string, Promise<LemmatizedToken[]>>();

/** Production Python API URL. */
const API_BASE = 'https://pythonvps.zerotohero.ca';

/** Max texts per batch request. Prevents overly large POST bodies. */
const BATCH_MAX_SIZE = 50;

// ── Hook ───────────────────────────────────────────────────────────────────

interface UseBatchLemmatizeResult {
  /** Look up cached tokens for a line. Returns null if not yet fetched. */
  getTokens: (text: string, l2: string) => LemmatizedToken[] | null;
  /** Number of texts currently in the batch queue. */
  queueSize: number;
  /** Force-tokenize a set of texts immediately (for pre-fetching). */
  preFetch: (texts: string[], l2: string) => void;
}

export function useBatchLemmatize(): UseBatchLemmatizeResult {
  const [, forceUpdate] = useState(0);
  const queueRef = useRef<Set<string>>(new Set());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Flush the pending queue: send all queued texts in one batch request. */
  const flush = useCallback(async () => {
    const queue = queueRef.current;
    if (queue.size === 0) return;
    queueRef.current = new Set();
    timerRef.current = null;

    // Group queued cache keys by language code
    const byLang = new Map<string, string[]>();
    for (const cacheKey of queue) {
      const colonIdx = cacheKey.indexOf(':');
      const lang = cacheKey.slice(0, colonIdx);
      const text = cacheKey.slice(colonIdx + 1);
      if (!byLang.has(lang)) byLang.set(lang, []);
      byLang.get(lang)!.push(text);
    }

    // Fire one batch request per language
    const promises: Promise<void>[] = [];
    for (const [lang, texts] of byLang) {
      promises.push(sendBatch(texts, lang));
    }
    await Promise.allSettled(promises);
    forceUpdate(n => n + 1);
  }, []);

  /** Enqueue a cache key for batch fetching. Debounced via microtask. */
  const enqueue = useCallback((cacheKey: string) => {
    if (tokenCache.has(cacheKey) || inflightMap.has(cacheKey)) return;

    queueRef.current.add(cacheKey);

    // Debounce: if queue reaches batch size, flush immediately
    if (queueRef.current.size >= BATCH_MAX_SIZE) {
      if (timerRef.current) clearTimeout(timerRef.current);
      flush();
      return;
    }

    // Otherwise flush on next microtask
    if (!timerRef.current) {
      timerRef.current = setTimeout(() => flush(), 0);
    }
  }, [flush]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  /** Synchronous cache lookup. Enqueues if missing. */
  const getTokens = useCallback((text: string, l2: string): LemmatizedToken[] | null => {
    const base = baseCode(l2);
    const cacheKey = `${base}:${text}`;

    const cached = tokenCache.get(cacheKey);
    if (cached) return cached;

    enqueue(cacheKey);
    return null;
  }, [enqueue]);

  /** Pre-fetch a batch of texts immediately (skips the queue). */
  const preFetch = useCallback((texts: string[], l2: string) => {
    const base = baseCode(l2);
    const uncached: string[] = [];

    for (const text of texts) {
      const cacheKey = `${base}:${text}`;
      if (!tokenCache.has(cacheKey) && !inflightMap.has(cacheKey)) {
        uncached.push(text);
      }
    }

    if (uncached.length > 0) {
      // Fire and forget — results go into tokenCache via sendBatch
      sendBatch(uncached, base);
    }
  }, []);

  return { getTokens, queueSize: queueRef.current.size, preFetch };
}

// ── Batch sender (module-level, not exported) ─────────────────────────────

async function sendBatch(texts: string[], lang: string): Promise<void> {
  // Deduplicate texts within the batch (same text can appear in multiple cues)
  const uniqueTexts = [...new Set(texts)];
  if (uniqueTexts.length === 0) return;

  // Build cache keys for dedup
  const keys = uniqueTexts.map(t => `${lang}:${t}`);

  // Check which are already in-flight
  const toFetch: { key: string; text: string }[] = [];
  for (let i = 0; i < keys.length; i++) {
    if (!inflightMap.has(keys[i])) {
      toFetch.push({ key: keys[i], text: uniqueTexts[i] });
    }
  }

  if (toFetch.length === 0) return;

  const textsToSend = toFetch.map(t => t.text);

  // Create a single shared promise for all texts in this batch
  const batchPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE}/lemmatize-normalized/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texts: textsToSend, l2: lang }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const results: LemmatizedToken[][] = data.results ?? [];

      // Populate cache: results[i] corresponds to textsToSend[i]
      for (let i = 0; i < results.length; i++) {
        const key = `${lang}:${textsToSend[i]}`;
        tokenCache.set(key, results[i]);
      }
    } catch (err) {
      console.warn('[LPV] Batch lemmatization failed:', err);
    } finally {
      // Clean up inflight entries
      for (const { key } of toFetch) {
        inflightMap.delete(key);
      }
    }
  })();

  // Register all texts as in-flight (so concurrent calls share the same promise)
  for (const { key } of toFetch) {
    inflightMap.set(key, batchPromise.then(() => tokenCache.get(key)!));
  }

  await batchPromise;
}

// ── Expose cache for debugging / testing ───────────────────────────────────

/** @internal Clear the token cache. Useful for testing or language switch. */
export function clearTokenCache(): void {
  tokenCache.clear();
  inflightMap.clear();
}
