import { firstGloss } from '@langplayer/shared';
import type { DictionaryEntry } from '@langplayer/shared';
import { baseCode, pickSavedEntry } from '@langplayer/utils';
import { PYTHON_API_URL } from '@/lib/api-url';

/**
 * Per-word L1 quick-gloss cache for TokenizedText.
 *
 * The batch dictionary lookup returns English definitions for speed. When the
 * user's L1 is not English, saved-word quick glosses fetch the L1-translated
 * definition individually and cache it so repeated tokens share one request.
 *
 * A surface form can match several dictionary entries; callers pass the saved
 * word's entry id so the gloss comes from the entry the user actually saved,
 * not the first lookup match.
 */

const _cache = new Map<string, string>();
const _inflight = new Map<string, Promise<string | null>>();

function cacheKey(l2Code: string, l1Code: string, text: string, preferredEntryId?: string): string {
  // Include the saved entry id: two saved entries for the same text must not
  // share a cached gloss.
  return `${baseCode(l2Code)}:${l1Code}:${preferredEntryId ?? ''}:${text}`;
}

/** Return a previously fetched L1 gloss, or null when not available yet. */
export function getL1Gloss(
  text: string,
  l2Code: string,
  l1Code: string,
  preferredEntryId?: string,
): string | null {
  const value = _cache.get(cacheKey(l2Code, l1Code, text, preferredEntryId));
  return value === undefined ? null : value;
}

/**
 * Fetch and cache the first L1-translated definition for a word.
 * When `preferredEntryId` (the saved word's entry id) is given, the matching
 * lookup result wins over the first result.
 */
export function fetchL1Gloss(
  text: string,
  l2Code: string,
  l1Code: string,
  preferredEntryId?: string,
): Promise<string | null> {
  const key = cacheKey(l2Code, l1Code, text, preferredEntryId);
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
      // Prefer the entry the user actually saved over the first match.
      const entry = pickSavedEntry(results, preferredEntryId, baseCode(l2Code)) ?? results[0];
      const gloss = entry?.definitions?.length ? firstGloss(entry.definitions) : null;
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
