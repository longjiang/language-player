/**
 * Shared helper for resolving the dictionary entry a user actually saved.
 *
 * A surface form can match several dictionary entries (homographs, multiple
 * senses, LLM vs curated). The saved-word record stores the exact entry id the
 * user chose, so quick glosses should show THAT entry's definition instead of
 * the first lookup result. Used by both web and mobile so the two apps pick
 * the same entry.
 */

import { isSameEntryId, type DictionaryEntry } from '@langplayer/shared';

/**
 * Pick the entry matching the saved word's id from a lookup result list.
 *
 * Returns undefined when no entry matches (or when no saved id is given) —
 * callers then fall back to their existing `results[0]` behavior.
 *
 * @param entries  Dictionary lookup results (e.g. /dictionary/lookup results).
 * @param savedWordId  Saved word / dictionary entry id (e.g. "cedict-0",
 *                     "llm-ja-abc123", or a CEDICT "寬廣,kuān_guǎng,0" id).
 * @param l2Code  Base language code (e.g. "zh", "ja") — used only to
 *                disambiguate numeric entry ids between EDICT and Kengdic.
 */
export function pickSavedEntry(
  entries: DictionaryEntry[] | undefined,
  savedWordId: string | undefined,
  l2Code: string,
): DictionaryEntry | undefined {
  if (!savedWordId || !entries || entries.length === 0) return undefined;
  return entries.find((e) => isSameEntryId(savedWordId, e.id, l2Code));
}
