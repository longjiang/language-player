/**
 * Legacy word ID resolution — UI-level only.
 *
 * Classic used different ID formats than our Python SQLite backend.
 * This module tries to resolve those legacy IDs to current IDs
 * WITHOUT mutating localStorage or syncing changes to the server.
 *
 * Known legacy formats:
 *   Classic cedict:  "0", "1", "42"        → "cedict-0", "cedict-1", "cedict-42"
 *   Classic edict:   "e7a9b..." (hash)     → unknown (different hash algorithm)
 *   Classic wiktionary: "w7a9b..." (hash)  → same algorithm — should match
 *   Classic freedict:   "f7a9b..." (hash)  → unknown
 *   Classic kengdic:    various            → unknown
 *
 * For IDs we can't resolve, we return null — those will be handled
 * by the "unrecognized saved word" UI in the dictionary popup.
 */

/**
 * Attempt to resolve a legacy saved-word ID to a current dictionary ID.
 * Returns the resolved ID, or null if unresolvable.
 *
 * Only handles the cases where we can deterministically map.
 * Does NOT modify any data — this is a pure lookup function.
 */
export function resolveLegacyId(wordId: string): string | null {
  // Classic cedict: plain numeric IDs like "0", "1", "42"
  // Our format: "cedict-0", "cedict-1", "cedict-42"
  if (/^\d+$/.test(wordId)) {
    return `cedict-${wordId}`;
  }

  // Classic wiktionary: "w" + hash — we use the same algorithm
  // No resolution needed — the ID should match directly
  if (wordId.startsWith('w')) {
    return null; // no resolution needed; direct match should work
  }

  // Unknown format — can't resolve
  return null;
}

/**
 * Check if a word is saved, with legacy ID resolution.
 *
 * Tries:
 *   1. Direct ID match (current format)
 *   2. Legacy ID resolution (Classic → current format)
 *
 * Returns true if the word is saved under any matching ID.
 */
export function isWordSaved(
  hasSavedWord: (l2Code: string, wordId: string) => boolean,
  l2Code: string,
  wordId: string,
): boolean {
  // Tier 1a: Direct match
  if (hasSavedWord(l2Code, wordId)) return true;

  // Tier 1b: Legacy resolution
  const resolved = resolveLegacyId(wordId);
  if (resolved && hasSavedWord(l2Code, resolved)) return true;

  return false;
}
