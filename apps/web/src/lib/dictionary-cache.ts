/**
 * Client-side dictionary entry cache.
 *
 * Pre-populated by TokenizedText after lemmatization via /dictionary/lookup-batch,
 * so DictionaryPopup opens instantly without a loading spinner.
 *
 * Cache key: `${l2Code}:${text}` — lemma text is language-specific.
 */

import type { DictionaryEntry } from '@langplayer/shared';
import { PYTHON_API_URL } from '@/lib/api-url';

// ── Cache ──

const cache = new Map<string, DictionaryEntry[]>();

/** Monotonically incremented on every cache write. Components can read this to invalidate stale computations. */
let _cacheVersion = 0;
export function getCacheVersion(): number { return _cacheVersion; }

export function getCachedEntries(l2Code: string, text: string): DictionaryEntry[] | undefined {
  return cache.get(`${l2Code}:${text}`);
}

export function setCachedEntries(l2Code: string, text: string, entries: DictionaryEntry[]): void {
  if (entries.length > 0) {
    cache.set(`${l2Code}:${text}`, entries);
    _cacheVersion++;
  }
}

// ── Bulk lookup ──

export async function bulkLookupWords(
  words: { text: string; l2Code: string; l1Code: string }[],
): Promise<void> {
  // Filter out words already in cache
  const uncached = words.filter((w) => !cache.has(`${w.l2Code}:${w.text}`));
  if (uncached.length === 0) return;

  try {
    const res = await fetch(`${PYTHON_API_URL}/dictionary/lookup-batch`, {
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
      // Store under each word's l2Code. All words in a batch share the same l1/l2,
      // so use the first uncached word's codes as default.
      const l2 = uncached[0]?.l2Code ?? '';
      if (entries.length > 0) {
        cache.set(`${l2}:${text}`, entries);
        _cacheVersion++;
      }
    }
  } catch {
    // Silently fail — popups will fall back to individual lookup
  }
}
