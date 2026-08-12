import type { DictionaryEntry } from '@langplayer/shared';
import { setL1CachedEntry } from '@/lib/dictionary-cache';
import { PYTHON_API_URL } from '@/lib/api-url';
import { baseCode } from '@langplayer/utils';

// In-flight dedup: key = `${l2}:${l1}:${text}` — while an L1 translation fetch
// is pending, concurrent callers share the same promise so the entry's
// definitions are translated (and cached) only once per session.
const inflight = new Map<string, Promise<DictionaryEntry[]>>();

/**
 * Fetch L1-translated dictionary entries for a surface text, deduplicated:
 * concurrent calls for the same (l2, l1, text) share one network request, and
 * every result is cached by entry id so other surfaces reuse the exact same
 * translation (SPEC-066 disparity 6 port of the web `lookupL1Text`).
 */
export function lookupL1Text(
  text: string,
  l2Code: string,
  l1Code: string,
): Promise<DictionaryEntry[]> {
  const l2 = baseCode(l2Code);
  const key = `${l2}:${l1Code}:${text}`;

  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = fetch(`${PYTHON_API_URL}/dictionary/lookup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, l2, l1: l1Code }),
  })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then((data) => {
      const results = (data.results ?? []) as DictionaryEntry[];
      for (const e of results) {
        setL1CachedEntry(l2, l1Code, e);
      }
      return results;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, promise);
  return promise;
}
