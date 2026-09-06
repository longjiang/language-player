/**
 * Text-search matching that is robust to invisible characters and collapse
 * whitespace, used by the reader search panels (SPEC-087 §8).
 *
 * A plain `indexOf` substring search breaks when the text contains an
 * invisible/zero-width character between two visible characters — most
 * commonly a zero-width space (U+200B) inserted by web pages / EPUB sources
 * for line-breaking or to defeat copy-paste. For example, searching "：“"
 * fails to match the text "：\u200B“" even though the two are visually
 * identical, because the invisible U+200B separates the colon from the
 * quote. Whitespace runs have the same problem: a newline or double space
 * inside the text breaks a search whose query has a single space.
 *
 * These helpers strip invisible characters, collapse whitespace runs to a
 * single space, and lowercase on BOTH the query and the matched text before
 * substring search, then map the match back onto the ORIGINAL text's char
 * coordinates so callers can highlight / navigate by exact source offsets.
 */

/** Zero-width / invisible characters that never contribute to a match.
 *  Includes: ZWSP, ZWNJ, ZWJ, Word Joiner, BOM / ZWNBSP. */
const INVISIBLE_CHARS = new Set(['\u200B', '\u200C', '\u200D', '\u2060', '\uFEFF']);

export interface TextMatch {
  /** 0-based start index of the match in the ORIGINAL text. */
  start: number;
  /** Exclusive end index of the match in the ORIGINAL text. */
  end: number;
}

interface ComparableText {
  /** The normalized string used for `indexOf`. */
  comparable: string;
  /** For each position in `comparable`, the corresponding index in the
   *  ORIGINAL text (1:1 — only single-char lowercasing is accepted, so a
   *  multi-codepoint lowercase expansion never breaks the mapping). */
  map: number[];
}

/** Build the comparable form of a string, tracking original-text indices. */
function toComparable(text: string): ComparableText {
  const chars: string[] = [];
  const map: number[] = [];
  let lastWasSpace = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (INVISIBLE_CHARS.has(c)) continue;
    if (/\s/.test(c)) {
      // Collapse a whitespace run to a single literal space (a leading run is
      // trimmed at the query level). We push ' ' rather than `c`, so a
      // newline/tab/ideographic-space run always becomes one plain space.
      if (lastWasSpace) continue;
      lastWasSpace = true;
      chars.push(' ');
      map.push(i);
      continue;
    }
    lastWasSpace = false;
    const lower = c.toLowerCase();
    // Only single-char lowercasing keeps the 1:1 original-index mapping.
    chars.push(lower.length === 1 ? lower : c);
    map.push(i);
  }
  return { comparable: chars.join(''), map };
}

/**
 * Find all non-overlapping matches of `query` in `text`.
 *
 * Matching ignores invisible/zero-width characters and treats any run of
 * whitespace as a single space, in both the query and the text. Returned
 * ranges are in the ORIGINAL text coordinates, so they stay valid for
 * `slice()`-based snippet building and navigation highlighting.
 *
 * The search is case-insensitive (single-codepoint lowercasing only, so CJK
 * and most Latin text behave as expected). When `limit` is given, at most
 * that many matches are returned.
 */
export function findTextMatches(text: string, query: string, limit?: number): TextMatch[] {
  const q = toComparable(query).comparable.trim();
  if (!q) return [];
  const { comparable, map } = toComparable(text);
  if (map.length === 0) return [];
  const max = limit ?? Number.POSITIVE_INFINITY;
  const out: TextMatch[] = [];
  let from = 0;
  while (out.length < max) {
    const idx = comparable.indexOf(q, from);
    if (idx === -1) break;
    const start = map[idx]!;
    const end = map[idx + q.length - 1]! + 1;
    out.push({ start, end });
    from = idx + q.length;
  }
  return out;
}
