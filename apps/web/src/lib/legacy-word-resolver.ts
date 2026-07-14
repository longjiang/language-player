/**
 * Legacy saved-word ID resolution.
 *
 * Classic generated its own IDs client-side (e.g., "0", "1", "cedict-0").
 * The Python backend uses different IDs (e.g., "cedict-0", "cedict-12345").
 *
 * This module resolves legacy IDs to potential current IDs so that
 * saved words from Classic still show as "saved" in the UI without
 * mutating localStorage or user_data.
 */

import type { SavedWord, DictionaryEntry } from '@langplayer/shared';

/**
 * Try to resolve a legacy saved-word ID to possible current dictionary IDs.
 *
 * Classic → Current mappings:
 *   "0"           → ["cedict-0"]        (numeric-only for cedict)
 *   "1"           → ["cedict-1"]
 *   "cedict-0"    → ["cedict-0"]        (already matches)
 *   "eabc123"     → ["edict-abc123"]    (prefix-only edict)
 *   "wabc123"     → ["wabc123"]         (wiktionary, same algorithm)
 *   "kabc123"     → ["kengdic-abc123"]  (prefix-only kengdic)
 *   "llm-zh-xxx"  → ["llm-zh-xxx"]      (LLM, already matches)
 *   unknown       → []                  (can't resolve)
 */
export function resolveLegacyId(savedWordId: string): string[] {
  if (!savedWordId) return [];

  // Already a full, current-format ID — return as-is
  if (
    savedWordId.startsWith('cedict-') ||
    savedWordId.startsWith('edict-') ||
    savedWordId.startsWith('kengdic-') ||
    savedWordId.startsWith('klingonska-') ||
    savedWordId.startsWith('cccanto-') ||
    savedWordId.startsWith('llm-') ||
    (savedWordId.startsWith('w') && savedWordId.length > 20)
  ) {
    return [savedWordId];
  }

  // Wiktionary IDs start with 'w' followed by a hash (long string)
  if (savedWordId.startsWith('w') && savedWordId.length > 10) {
    return [savedWordId];
  }

  // Pure numeric — Classic HSK-CEDICT ID (e.g., "0", "123")
  if (/^\d+$/.test(savedWordId)) {
    return [`cedict-${savedWordId}`];
  }

  // Single-letter prefix + hash — Classic single-letter source prefix
  // e = edict, k = kengdic, d = dialect, f = freedict
  const legacyPrefixMap: Record<string, string> = {
    e: 'edict',
    k: 'kengdic',
    d: 'cc-canto',   // dialect → cccanto
    f: 'freedict',
  };

  for (const [prefix, source] of Object.entries(legacyPrefixMap)) {
    if (savedWordId.startsWith(prefix) && savedWordId.length > 5) {
      return [`${source}-${savedWordId.slice(1)}`];
    }
  }

  // Can't resolve — return empty
  return [];
}

/**
 * Check if a saved word matches any of the given dictionary entries,
 * either by direct ID match or by legacy ID resolution.
 */
export function savedWordMatchesEntry(
  savedWord: SavedWord,
  entries: DictionaryEntry[],
): boolean {
  const possibleIds = resolveLegacyId(savedWord.id);

  return entries.some((entry) => possibleIds.includes(entry.id));
}

/**
 * Find saved words for a token that match and don't match the current entries.
 */
export function partitionSavedWords(
  tokenText: string,
  savedWords: SavedWord[],
  entries: DictionaryEntry[],
): { matched: SavedWord[]; unmatched: SavedWord[] } {
  const tokenLower = tokenText.toLowerCase();
  // Find saved words whose forms include this token
  const relevant = savedWords.filter((sw) =>
    sw.forms.some((f) => f.toLowerCase() === tokenLower),
  );

  const matched: SavedWord[] = [];
  const unmatched: SavedWord[] = [];

  for (const sw of relevant) {
    if (savedWordMatchesEntry(sw, entries)) {
      matched.push(sw);
    } else {
      unmatched.push(sw);
    }
  }

  return { matched, unmatched };
}
