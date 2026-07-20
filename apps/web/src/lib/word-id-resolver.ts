/**
 * Word ID resolution — decomposes saved-word IDs into (dictionary, entry) pairs
 * for navigation and bookmark-state detection.
 *
 * All saved words and dictionary entries share the same ID scheme
 * (see ADR 0006 § Dictionary Entry ID Schemes):
 *
 *   CEDICT (zh):    寬廣,kuān_guǎng,0    → dict=cedict,     id=寬廣,kuān_guǎng,0
 *   EDICT (ja):     93628                → dict=edict,       id=93628
 *   Kengdic (ko):   500885               → dict=kengdic,     id=500885
 *   Wiktionary:     w1190326473          → dict=wiktionary,  id=w1190326473
 *   LLM:            llm-ja-56818f257212  → dict=llm,         id=ja-56818f257212
 *
 * Since both sides use the same scheme, saved-word matching is a direct
 * string comparison. Decomposition is only needed for navigation (constructing
 * the /dictionary/entry route) and for disambiguating pure-digit IDs between
 * EDICT and Kengdic.
 */

export interface WordIdDecomposition {
  /** Dictionary identifier for the /dictionary/entry endpoint (e.g., 'cedict', 'edict', 'llm') */
  dict: string;
  /** Scoped entry ID within that dictionary */
  id: string;
}

/**
 * Decompose a word ID into its dictionary and scoped entry ID.
 *
 * Detection rules (order matters — each pattern is mutually exclusive):
 *   1. Contains ','        → CEDICT
 *   2. Starts with 'llm-'  → LLM (strip prefix for scoped id)
 *   3. /^w\d+$/            → Wiktionary
 *   4. /^\d+$/ + l2='ja'   → EDICT
 *   5. /^\d+$/ + l2='ko'   → Kengdic
 *   6. /^\d+$/ + other     → Wiktionary (legacy numeric-only IDs)
 *
 * Returns null for unrecognized formats.
 */
export function decomposeWordId(
  wordId: string,
  l2: string,
): WordIdDecomposition | null {
  // CEDICT: comma-separated — {traditional},{pinyin_with_underscores},{index}
  if (wordId.includes(',')) {
    return { dict: 'cedict', id: wordId };
  }

  // LLM: llm-{l2}-{12-char-md5-hash}
  if (wordId.startsWith('llm-')) {
    // Strip 'llm-' prefix to get the scoped ID for the /dictionary/entry endpoint
    return { dict: 'llm', id: wordId.slice(4) };
  }

  // Wiktionary: w + djb2 hash digits
  if (/^w\d+$/.test(wordId)) {
    return { dict: 'wiktionary', id: wordId };
  }

  // Pure digits — disambiguate EDICT vs Kengdic by language
  if (/^\d+$/.test(wordId)) {
    if (l2 === 'ja') return { dict: 'edict', id: wordId };
    if (l2 === 'ko') return { dict: 'kengdic', id: wordId };
    // Some languages (ru, tlh, yue) have legacy numeric-only Wiktionary IDs
    return { dict: 'wiktionary', id: wordId };
  }

  return null;
}

/**
 * Check whether a word ID is present in the saved-words store.
 *
 * Since dictionary entries and saved words use the same raw ID scheme,
 * this is a direct string comparison — no resolution needed.
 */
export function isWordSaved(
  hasSavedWord: (l2Code: string, wordId: string) => boolean,
  l2Code: string,
  wordId: string,
): boolean {
  return hasSavedWord(l2Code, wordId);
}

