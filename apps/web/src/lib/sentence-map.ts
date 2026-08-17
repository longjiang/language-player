/**
 * Sentence-to-sentence mapping between an L2 block and its translation.
 *
 * Translations are fetched per block (paragraph), not per sentence, so the
 * reader derives the mapping client-side: segment both strings by
 * sentence-final punctuation and align by index (or proportionally when the
 * counts differ). Used by the readers to highlight the translation sentence
 * that contains the hovered token.
 *
 * v1 alignment is approximate by design: it trusts the translation to keep
 * sentence order, which LLM paragraph translations typically do. When
 * segmentation or alignment fails, callers get `null` and simply render the
 * plain translation.
 */

/** Char range in a source string; end exclusive. */
export interface SentenceRange {
  start: number;
  end: number;
}

export interface SentenceMap {
  /** Translation sentences in order — render these to cover the full text. */
  tr: SentenceRange[];
  /** l2[i] ↔ tr[i] aligned pairs (proportional when the counts differ). */
  pairs: { l2: SentenceRange; tr: SentenceRange }[];
}

/** Sentence-final punctuation (L2 scripts + Latin + common L1 scripts). */
const FINAL_PUNCT = /[。！？；．｡.!?;…]/u;
/** Trailing quotes/brackets that stay attached to their sentence. */
const CLOSERS = /["”'』」）)\]】]/u;
/** Common abbreviations whose trailing dot must not end a sentence. */
const ABBREVIATIONS = new Set([
  'mr', 'mrs', 'ms', 'dr', 'st', 'vs', 'etc', 'ie', 'eg', 'no', 'prof',
  'sr', 'jr', 'dept', 'fig', 'approx', 'min', 'max', 'jan', 'feb', 'mar',
  'apr', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
]);

/** True when `text[i]` ends a sentence (with cheap false-split guards). */
function isSentenceEnd(text: string, i: number): boolean {
  const ch = text[i]!;
  if (!FINAL_PUNCT.test(ch)) return false;
  if (ch === '.') {
    // Decimal point: "3.14"
    if (
      i > 0 &&
      i + 1 < text.length &&
      /\d/.test(text[i - 1]!) &&
      /\d/.test(text[i + 1]!)
    ) {
      return false;
    }
    // Initials / abbreviations: "J. K. Rowling", "Mr. Smith" — a dot after a
    // letter that follows whitespace (or the string start) is an initial, and
    // a dot after a known abbreviation never ends a sentence.
    const prevIsLetter = i > 0 && /[A-Za-z]/.test(text[i - 1]!);
    if (prevIsLetter) {
      const beforeIsBoundary = i < 2 || /\s/.test(text[i - 2]!);
      if (beforeIsBoundary) return false;
      let wordStart = i - 1;
      while (wordStart > 0 && /[A-Za-z]/.test(text[wordStart - 1]!)) wordStart--;
      const word = text.slice(wordStart, i).toLowerCase();
      if (ABBREVIATIONS.has(word)) return false;
    }
  }
  return true;
}

/** Split text into sentence char ranges; the last segment may lack final
 *  punctuation. Always covers the whole string, in order. */
export function segmentSentences(text: string): SentenceRange[] {
  const out: SentenceRange[] = [];
  let start = 0;
  let i = 0;
  const n = text.length;
  while (i < n) {
    if (isSentenceEnd(text, i)) {
      let j = i;
      // Absorb punctuation runs ("…。", "!?") then trailing closers.
      while (j < n && FINAL_PUNCT.test(text[j]!)) j++;
      while (j < n && CLOSERS.test(text[j]!)) j++;
      out.push({ start, end: j });
      start = j;
      i = j;
    } else {
      i++;
    }
  }
  if (start < n) out.push({ start, end: n });
  return out;
}

/**
 * Build the L2↔translation sentence map. Null when either side has no
 * segments (empty/parse-failed). When the sentence counts match, sentences
 * align 1:1 by index; otherwise each L2 sentence maps to the translation
 * sentence whose character midpoint fraction is nearest (covers LLM
 * merges/splits with a best-effort highlight).
 */
export function buildSentenceMap(l2Text: string, trText: string): SentenceMap | null {
  const l2 = segmentSentences(l2Text);
  const tr = segmentSentences(trText);
  if (l2.length === 0 || tr.length === 0) return null;

  if (l2.length === tr.length) {
    return { tr, pairs: l2.map((s, i) => ({ l2: s, tr: tr[i]! })) };
  }

  const l2Len = Math.max(1, l2Text.length);
  const trLen = Math.max(1, trText.length);
  const pairs = l2.map((s) => {
    const frac = (s.start + s.end) / 2 / l2Len;
    let best = 0;
    let bestDist = Infinity;
    for (let j = 0; j < tr.length; j++) {
      const t = tr[j]!;
      const d = Math.abs((t.start + t.end) / 2 / trLen - frac);
      if (d < bestDist) {
        bestDist = d;
        best = j;
      }
    }
    return { l2: s, tr: tr[best]! };
  });
  return { tr, pairs };
}

/** Index into `map.pairs` of the L2 sentence containing `pos`, or null. */
export function sentenceIndexAt(map: SentenceMap, pos: number): number | null {
  for (let i = 0; i < map.pairs.length; i++) {
    const s = map.pairs[i]!.l2;
    if (pos >= s.start && pos < s.end) return i;
  }
  return null;
}
