/**
 * Shared dictionary entry cache.
 *
 * A reactive, app-wide cache of dictionary entries keyed by `l2Code:text`.
 * Pre-populated by TokenizedText after lemmatization via /dictionary/lookup-batch,
 * so DictionaryPopup opens instantly without a loading spinner.
 *
 * Both web and mobile import from this module directly.
 * The platform-specific files (apps/web/src/lib/dictionary-cache.ts, etc.)
 * re-export from here for backward compatibility during migration.
 */

import type { DictionaryEntry } from '@langplayer/shared';

// ── Cache ──

const cache = new Map<string, DictionaryEntry[]>();

type Listener = () => void;
const listeners = new Set<Listener>();

/** Monotonically incremented on every cache write. */
let _cacheVersion = 0;

export function getCacheVersion(): number {
  return _cacheVersion;
}

export function getCachedEntries(l2Code: string, text: string): DictionaryEntry[] | undefined {
  return cache.get(`${l2Code}:${text}`);
}

export function setCachedEntries(l2Code: string, text: string, entries: DictionaryEntry[]): void {
  if (entries.length > 0) {
    cache.set(`${l2Code}:${text}`, entries);
    _cacheVersion++;
    notify();
  }
}

// ── Subscriptions (for reactive hooks) ──

export function subscribeToCache(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(): void {
  for (const fn of listeners) fn();
}

// ── In-flight request deduplication ──

const _inflightRequests = new Map<string, Promise<void>>();

// ── Bulk lookup ──

/**
 * Bulk-lookup dictionary entries for a list of (text, l2Code, l1Code) tuples.
 * Results are stored in the shared cache. Already-cached words are skipped.
 */
export async function bulkLookupWords(
  words: { text: string; l2Code: string; l1Code: string }[],
  apiUrl: string,
): Promise<void> {
  // Filter out words already in cache
  const uncached = words.filter((w) => !cache.has(`${w.l2Code}:${w.text}`));
  if (uncached.length === 0) return;

  // Deduplicate: if an identical batch is already in-flight, reuse its promise.
  const batchKey = uncached.length === 1
    ? `1:${uncached[0]!.l2Code}:${uncached[0]!.text}`
    : `N:${uncached.length}:${uncached[0]!.l2Code}`;

  const existing = _inflightRequests.get(batchKey);
  if (existing) return existing;

  const promise = _doBulkLookup(uncached, apiUrl).finally(() => {
    _inflightRequests.delete(batchKey);
  });
  _inflightRequests.set(batchKey, promise);
  return promise;
}

async function _doBulkLookup(
  uncached: { text: string; l2Code: string; l1Code: string }[],
  apiUrl: string,
): Promise<void> {
  try {
    const res = await fetch(`${apiUrl}/dictionary/lookup-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        words: uncached.map((w) => ({ text: w.text, l2: w.l2Code, l1: w.l1Code })),
      }),
    });
    if (!res.ok) return;
    const data = await res.json();
    const results: Record<string, DictionaryEntry[]> = data.results ?? {};

    for (const [text, entries] of Object.entries(results)) {
      const l2 = uncached[0]?.l2Code ?? '';
      if (entries.length > 0) {
        cache.set(`${l2}:${text}`, entries);
        _cacheVersion++;
        notify();
      }
    }
  } catch {
    // Silently fail — popups will fall back to individual lookup
  }
}
