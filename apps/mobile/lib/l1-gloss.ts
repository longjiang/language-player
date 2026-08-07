import { firstGloss } from '@langplayer/shared';
import type { DictionaryEntry } from '@langplayer/shared';
import { baseCode } from '@langplayer/utils';
import { PYTHON_API_URL } from '@/lib/api-url';

/**
 * Per-word L1 quick-gloss cache for TokenizedText.
 *
 * The batch dictionary lookup returns English definitions for speed. When the
 * user's L1 is not English, saved-word quick glosses fetch the L1-translated
 * definition individually and cache it so repeated tokens share one request.
 */

const _cache = new Map<string, string>();
const _inflight = new Map<string, Promise<string | null>>();

function cacheKey(l2Code: string, l1Code: string, text: string): string {
  return `${baseCode(l2Code)}:${l1Code}:${text}`;
}

/** Return a previously fetched L1 gloss, or null when not available yet. */
export function getL1Gloss(text: string, l2Code: string, l1Code: string): string | null {
  const value = _cache.get(cacheKey(l2Code, l1Code, text));
  return value === undefined ? null : value;
}

/** Fetch and cache the first L1-translated definition for a word. */
export function fetchL1Gloss(text: string, l2Code: string, l1Code: string): Promise<string | null> {
  const key = cacheKey(l2Code, l1Code, text);
  const cached = _cache.get(key);
  if (cached !== undefined) return Promise.resolve(cached);

  const existing = _inflight.get(key);
  if (existing) return existing;

  const promise = fetch(`${PYTHON_API_URL}/dictionary/lookup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, l2: baseCode(l2Code), l1: l1Code }),
  })
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
    .then((data) => {
      const results = (data.results ?? []) as DictionaryEntry[];
      const gloss = results[0]?.definitions?.length
        ? firstGloss(results[0].definitions)
        : null;
      _cache.set(key, gloss ?? '');
      return gloss;
    })
    .catch(() => null)
    .finally(() => {
      _inflight.delete(key);
    });

  _inflight.set(key, promise);
  return promise;
}
