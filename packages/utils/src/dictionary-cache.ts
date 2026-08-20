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
// The batch endpoint deliberately returns [] for words that are not present
// in the local dictionary. Keep those successful misses separate from the
// entry cache so callers that need a richer single-word lookup can still see
// getCachedEntries() as a miss, while background prefetch does not retry the
// same word on every cache-driven render.
const negativeTextCache = new Set<string>();

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
    const key = `${l2Code}:${text}`;
    negativeTextCache.delete(key);
    textCache.set(key, entries);
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

// ── L1-translated entries ──
// key = `${l2Code}:${l1Code}:${entryId}` → entry whose definitions are already
// translated into l1. Populated by the review back side and the dictionary
// popup so an entry's L1 translation is fetched at most once per (l2, l1) —
// the server re-translates on every call, so duplicate fetches are redundant
// and produce slightly different wording.
const l1Cache = new Map<string, DictionaryEntry>();

/** Get an L1-translated entry by its ID, or undefined if not yet fetched. */
export function getL1CachedEntry(
  l2Code: string,
  l1Code: string,
  entryId: string,
): DictionaryEntry | undefined {
  return l1Cache.get(`${l2Code}:${l1Code}:${entryId}`);
}

/** Get every L1-translated entry already cached for the given entry IDs. */
export function getL1CachedEntries(
  l2Code: string,
  l1Code: string,
  entryIds: string[],
): DictionaryEntry[] {
  const out: DictionaryEntry[] = [];
  for (const id of entryIds) {
    const entry = l1Cache.get(`${l2Code}:${l1Code}:${id}`);
    if (entry) out.push(entry);
  }
  return out;
}

/** Cache an L1-translated entry by its ID. */
export function setL1CachedEntry(
  l2Code: string,
  l1Code: string,
  entry: DictionaryEntry,
): void {
  if (!entry?.id) return;
  l1Cache.set(`${l2Code}:${l1Code}:${entry.id}`, entry);
  _cacheVersion++;
  notify();
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
  const uncached = words.filter((w) => {
    const key = `${w.l2Code}:${w.text}`;
    return !textCache.has(key) && !negativeTextCache.has(key);
  });
  if (uncached.length === 0) return;

  // The batch endpoint takes one language per request — group by l2Code so
  // mixed-language queues can't misattribute results (results are keyed by
  // text only, not text+l2).
  const byL2 = new Map<string, { text: string; l2Code: string }[]>();
  for (const w of uncached) {
    const group = byL2.get(w.l2Code);
    if (group) group.push(w);
    else byL2.set(w.l2Code, [w]);
  }

  await Promise.all([...byL2.values()].map((group) => _dedupedBulkLookup(group, apiUrl)));
}

/**
 * Deduplicate in-flight requests by the exact word set (not just count+l2,
 * which could collide and silently drop a second batch with different words).
 * Identical batches share one request; different batches never collide.
 */
function _dedupedBulkLookup(
  group: { text: string; l2Code: string }[],
  apiUrl: string,
): Promise<void> {
  const batchKey = group
    .map((w) => `${w.l2Code}:${w.text}`)
    .sort()
    .join('\u0000');
  const existing = _inflightRequests.get(batchKey);
  if (existing) return existing;

  const promise = _doBulkLookup(group, apiUrl).finally(() => {
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
    await _postBulkLookup(uncached, apiUrl);
  } catch {
    // Batch failed — retry per word so one bad word (or a transient error)
    // can't silently drop the rest of the batch. Popups still fall back to
    // individual lookup if these also fail.
    await Promise.allSettled(uncached.map((w) => _postBulkLookup([w], apiUrl)));
  }
}

async function _postBulkLookup(
  words: { text: string; l2Code: string }[],
  apiUrl: string,
): Promise<void> {
  const res = await fetch(`${apiUrl}/dictionary/lookup-batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      words: words.map((w) => ({ text: w.text, l2: w.l2Code })),
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const results: Record<string, DictionaryEntry[]> = data.results ?? {};

  // A group is single-language by construction (see bulkLookupWords).
  const l2 = words[0]?.l2Code ?? '';
  for (const word of words) {
    const text = word.text;
    const entries = results[text] ?? [];
    if (entries.length > 0) {
      const key = `${l2}:${text}`;
      negativeTextCache.delete(key);
      textCache.set(key, entries);
      for (const entry of entries) {
        if (entry.id) {
          idCache.set(`${l2}:${entry.id}`, entry);
        }
      }
      _cacheVersion++;
      notify();
    } else if (!textCache.has(`${l2}:${text}`)) {
      // An empty result is a successful, authoritative batch lookup. Do not
      // expose it through getCachedEntries(): interactive callers should still
      // be able to fall back to the richer single-word endpoint on demand.
      negativeTextCache.add(`${l2}:${text}`);
    }
  }
}

// ── Queued (batched) dictionary lookup ────────────────────────────────
// TokenizedText lines enqueue their lemmas; a short timer flushes the queue
// through bulkLookupWords() in one /dictionary/lookup-batch request instead of
// firing one small request per subtitle line. Laziness is preserved: only
// lines that have been lemmatized (i.e. became visible) enqueue anything.
interface LookupQueueItem {
  key: string;
  text: string;
  l2Code: string;
  resolve: () => void;
  reject: (err: unknown) => void;
}

const lookupQueue: LookupQueueItem[] = [];
const lookupSeen = new Set<string>();
let lookupTimer: ReturnType<typeof setTimeout> | null = null;
let lookupApiUrl = '';
const LOOKUP_BATCH_MAX = 100;
const LOOKUP_BATCH_DELAY_MS = 80;

/**
 * Queue dictionary lookups for a set of words and resolve when they complete.
 * Words already in the cache are skipped. Identical words queued by multiple
 * lines are looked up once.
 *
 * Resolves with `true` when at least one word was actually queued for lookup,
 * `false` when everything was already cached or already queued — callers can
 * use this to gate cache-version bumps and avoid render loops (TokenizedText
 * recomputes merge/highlight memos on cacheVersion).
 */
export function enqueueLookupWords(
  words: { text: string; l2Code: string }[],
  apiUrl: string,
): Promise<boolean> {
  const uncached = words.filter((w) => {
    const key = `${w.l2Code}:${w.text}`;
    return !textCache.has(key) && !negativeTextCache.has(key);
  });
  if (uncached.length === 0) return Promise.resolve(false);

  let remaining = 0;
  let queuedAny = false;
  let resolveAll!: (queued: boolean) => void;
  let rejectAll!: (err: unknown) => void;
  const done = new Promise<boolean>((resolve, reject) => {
    resolveAll = resolve;
    rejectAll = reject;
  });

  for (const w of uncached) {
    const key = `${w.l2Code}:${w.text}`;
    if (lookupSeen.has(key)) continue;
    lookupSeen.add(key);
    queuedAny = true;
    remaining++;
    lookupQueue.push({
      key,
      text: w.text,
      l2Code: w.l2Code,
      resolve: () => {
        remaining--;
        if (remaining === 0) resolveAll(queuedAny);
      },
      reject: rejectAll,
    });
  }

  if (remaining === 0) return Promise.resolve(queuedAny);

  lookupApiUrl = apiUrl;
  scheduleLookupFlush();
  return done;
}

function scheduleLookupFlush() {
  if (lookupTimer) return;
  lookupTimer = setTimeout(() => {
    lookupTimer = null;
    void flushLookupQueue();
  }, LOOKUP_BATCH_DELAY_MS);
}

async function flushLookupQueue() {
  // Drain the whole queue in chunks — words beyond LOOKUP_BATCH_MAX that
  // enqueued before this flush must not be stranded until a later enqueue.
  while (lookupQueue.length > 0) {
    const items = lookupQueue.splice(0, LOOKUP_BATCH_MAX);
    if (items.length === 0) break;

    // Only release the seen-markers for words actually flushed; anything left
    // in the queue stays deduplicated until its own flush.
    for (const item of items) lookupSeen.delete(item.key);

    try {
      await bulkLookupWords(
        items.map((i) => ({ text: i.text, l2Code: i.l2Code })),
        lookupApiUrl,
      );
      for (const item of items) item.resolve();
    } catch (err) {
      for (const item of items) item.reject(err);
    }
  }
}
