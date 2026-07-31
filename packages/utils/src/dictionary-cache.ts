/**
 * Shared dictionary entry cache.
 *
 * A reactive, app-wide cache of dictionary entries keyed by both `l2Code:text`
 * and `entryId`. Pre-populated by TokenizedText after lemmatization via
 * /dictionary/lookup-batch, so DictionaryPopup and word detail pages open
 * instantly without a loading spinner.
 *
 * Both web and mobile import from this module directly.
 * The platform-specific files (apps/web/src/lib/dictionary-cache.ts, etc.)
 * re-export from here for backward compatibility during migration.
 */

import type { DictionaryEntry } from '@langplayer/shared';

// ── Dual-indexed cache ──
// textCache:  key = `${l2Code}:${text}`    → entries[]
// idCache:    key = `${l2Code}:${entryId}`  → single entry

const textCache = new Map<string, DictionaryEntry[]>();
const idCache = new Map<string, DictionaryEntry>();

type Listener = () => void;
const listeners = new Set<Listener>();

/** Monotonically incremented on every cache write. */
let _cacheVersion = 0;

export function getCacheVersion(): number {
  return _cacheVersion;
}

export function getCachedEntries(l2Code: string, text: string): DictionaryEntry[] | undefined {
  return textCache.get(`${l2Code}:${text}`);
}

export function setCachedEntries(l2Code: string, text: string, entries: DictionaryEntry[]): void {
  if (entries.length > 0) {
    textCache.set(`${l2Code}:${text}`, entries);
    // Also index each entry by its ID
    for (const entry of entries) {
      if (entry.id) {
        idCache.set(`${l2Code}:${entry.id}`, entry);
      }
    }
    _cacheVersion++;
    notify();
  }
}

/** Look up a single entry by its ID (e.g. "cedict-59845"). */
export function getCachedEntryById(l2Code: string, entryId: string): DictionaryEntry | undefined {
  return idCache.get(`${l2Code}:${entryId}`);
}

/** Store a single entry by its ID (for deep-link fetches). */
export function setCachedEntryById(l2Code: string, entry: DictionaryEntry): void {
  if (entry.id) {
    idCache.set(`${l2Code}:${entry.id}`, entry);
    _cacheVersion++;
    notify();
  }
}

// ── Debug helpers ──

/** List all ID cache keys (for debugging). */
export function getIdCacheKeys(l2Code?: string): string[] {
  const keys: string[] = [];
  for (const key of idCache.keys()) {
    if (!l2Code || key.startsWith(`${l2Code}:`)) {
      keys.push(key);
    }
  }
  return keys.sort();
}

/** List all text cache keys (for debugging). */
export function getTextCacheKeys(l2Code?: string): string[] {
  const keys: string[] = [];
  for (const key of textCache.keys()) {
    if (!l2Code || key.startsWith(`${l2Code}:`)) {
      keys.push(key);
    }
  }
  return keys.sort();
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
 * Bulk-lookup dictionary entries for a list of (text, l2Code) tuples.
 * Results are stored in the shared cache. Already-cached words are skipped.
 *
 * DESIGN: No l1 parameter — the batch endpoint returns English definitions
 * only, for speed. Callers that need L1-translated definitions should use
 * the single-word /dictionary/lookup endpoint with an l1 param.
 */
export async function bulkLookupWords(
  words: { text: string; l2Code: string }[],
  apiUrl: string,
): Promise<void> {
  // Filter out words already in cache
  const uncached = words.filter((w) => !textCache.has(`${w.l2Code}:${w.text}`));
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
  uncached: { text: string; l2Code: string }[],
  apiUrl: string,
): Promise<void> {
  try {
    const res = await fetch(`${apiUrl}/dictionary/lookup-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        words: uncached.map((w) => ({ text: w.text, l2: w.l2Code })),
      }),
    });
    if (!res.ok) return;
    const data = await res.json();
    const results: Record<string, DictionaryEntry[]> = data.results ?? {};

    for (const [text, entries] of Object.entries(results)) {
      const l2 = uncached[0]?.l2Code ?? '';
      if (entries.length > 0) {
        textCache.set(`${l2}:${text}`, entries);
        for (const entry of entries) {
          if (entry.id) {
            idCache.set(`${l2}:${entry.id}`, entry);
          }
        }
        _cacheVersion++;
        notify();
      }
    }
  } catch {
    // Silently fail — popups will fall back to individual lookup
  }
}
