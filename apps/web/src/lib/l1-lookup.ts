import type { DictionaryEntry } from '@langplayer/shared';
import { setL1CachedEntry } from '@/lib/dictionary-cache';
import { PYTHON_API_URL } from '@/lib/api-url';
import { baseCode } from '@/lib/language-data';

// In-flight dedup: key = `${l2}:${l1}:${text}` — while an L1 translation fetch
// is pending, concurrent callers share the same promise so the entry's
// definitions are translated (and cached) only once per session instead of
// every surface (review back side, popup) re-fetching and getting slightly
// different wording.
const inflight = new Map<string, Promise<DictionaryEntry[]>>();

/**
 * Fetch L1-translated dictionary entries for a surface text, deduplicated:
 * concurrent calls for the same (l2, l1, text) share one network request, and
 * every result is cached by entry id so other surfaces reuse the exact same
 * translation.
 *
 * The l1 code is used as-is (callers pass the full BCP-47 subtag, e.g.
 * "zh-Hans") and the l2 is normalized to its base code — matching the keys the
 * review back side and popup use for `getL1CachedEntry(s)`.
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
