/**
 * Legacy word ID resolution — UI-level only.
 *
 * Classic used different ID formats than our Python SQLite backend.
 * This module resolves legacy IDs to current IDs WITHOUT mutating
 * localStorage or syncing changes to the server.
 *
 * Resolution rules (matching what the backend import scripts produce):
 *
 *   Classic format              →  Current format
 *   ─────────────────────────────────────────────
 *   cedict:    "0", "42"        →  "cedict-0", "cedict-42"
 *   edict:     "e7a9b3..."      →  "edict-e7a9b3..."
 *   kengdic:   "k7a9b3..."      →  "kengdic-k7a9b3..."
 *   wiktionary:"w7a9b3..."      →  "wiktionary-7a9b3..."   (strip 'w')
 *   freedict:  "f7a9b3..."      →  (unknown — can't resolve)
 *   klingonska:"..."            →  "klingonska-..."
 *   cccanto:   "d7a9b3..."      →  "cccanto-d7a9b3..."
 *
 * Verification: resolution only suggests a candidate ID. The actual
 * match is verified when the dictionary popup loads entries — if the
 * resolved ID matches a loaded entry's ID and the entry's head matches
 * the saved word's form, the word shows as saved. If not, it falls
 * through to the "unrecognized saved word" warning (Tier 2).
 */

/** Known source prefix mappings for Classic → Current format. */
const SOURCE_MAPPINGS: { classicPrefix: string; currentPrefix: string }[] = [
  { classicPrefix: 'cedict-', currentPrefix: 'cedict-' },  // already current
  { classicPrefix: 'w',       currentPrefix: 'wiktionary-' },  // strip 'w'
  { classicPrefix: 'e',       currentPrefix: 'edict-' },
  { classicPrefix: 'k',       currentPrefix: 'kengdic-' },  // kengdic (single-char prefix)
  { classicPrefix: 'f',       currentPrefix: 'freedict-' },
  { classicPrefix: 'd',       currentPrefix: 'cccanto-' },
  { classicPrefix: 'llm-',    currentPrefix: 'llm-' },  // already current
];

/**
 * Attempt to resolve a legacy saved-word ID to a current dictionary ID.
 * Returns the resolved ID, or null if unresolvable.
 *
 * This is a pure function — no API calls, no data mutation.
 */
export function resolveLegacyId(wordId: string): string | null {
  // Classic cedict: plain numeric IDs like "0", "1", "42"
  // Our format: "cedict-0", "cedict-1", "cedict-42"
  if (/^\d+$/.test(wordId)) {
    return `cedict-${wordId}`;
  }

  // Check if the ID already starts with a known current prefix
  for (const { currentPrefix } of SOURCE_MAPPINGS) {
    if (wordId.startsWith(currentPrefix)) {
      return null; // already in current format, no resolution needed
    }
  }

  // Try classic prefix → current prefix mappings
  for (const { classicPrefix, currentPrefix } of SOURCE_MAPPINGS) {
    if (wordId.startsWith(classicPrefix)) {
      // For single-char classic prefixes (e, k, f, d, w), we need to be
      // careful not to match IDs that happen to start with that letter
      // but aren't actually hash-based IDs.
      // Heuristic: classic hash-based IDs are 7+ chars after the prefix.
      const rest = wordId.slice(classicPrefix.length);
      if (rest.length >= 6) {
        // wiktionary: strip 'w', prefix 'wiktionary-'
        if (classicPrefix === 'w') {
          return `wiktionary-${rest}`;
        }
        // All others: prefix with the full current prefix
        return `${currentPrefix}${rest}`;
      }
    }
  }

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

