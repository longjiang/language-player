import type { LemmatizedToken } from '@langplayer/shared';

/**
 * Sentence segmentation for saved-word context.
 *
 * Primary path is `Intl.Segmenter` with `granularity: 'sentence'` — the
 * standards-based, locale-aware segmenter (Unicode UAX #29, Baseline since
 * April 2024). It handles:
 *   - locale-specific terminators (。！？ ! ? । …)
 *   - closing quotes:  "“Hello,” she said. “Hi,” he replied."
 *   - decimals:        "The value of pi is 3.14159."
 *   - space-less scripts (Thai, CJK) as one segment when unpunctated.
 *
 * Known limitation: UAX #29 carries no abbreviation lists, so a short
 * capitalized abbreviation followed by an uppercase word ("Dr. Smith went
 * home.") splits after the abbreviation. We patch that by merging a segment
 * that is exactly one of a small curated set of common Latin abbreviations
 * ("Mr. ", "Dr. ", "St. ", "Prof. ", …) into the following segment. The list
 * is deliberate — a shape-based rule ("short capitalized word + period")
 * would wrongly merge real short sentences like "One. Two.". Decimals are
 * already handled by ICU (period + digit), as are lowercase abbreviations
 * ("e.g.", "Inc.") since a new sentence normally starts with an uppercase
 * letter. Other scripts are untouched.
 *
 * Fallback: a conservative regex, used only in runtimes without
 * `Intl.Segmenter` (Firefox < 125, Safari < 14.1, Chrome < 87).
 */

export interface SentenceSegment {
  /** Sentence text as produced by the segmenter (may include trailing whitespace). */
  text: string;
  /** UTF-16 character offset of the segment start in the input. */
  start: number;
  /** UTF-16 character offset just past the segment end. */
  end: number;
}

/** Segmenters are comparatively expensive to construct — cache one per locale. */
const segmenterCache = new Map<string, Intl.Segmenter>();

function getSegmenter(locale: string): Intl.Segmenter | null {
  if (typeof Intl === 'undefined' || typeof (Intl as { Segmenter?: unknown }).Segmenter !== 'function') {
    return null;
  }
  let seg = segmenterCache.get(locale);
  if (!seg) {
    try {
      seg = new Intl.Segmenter(locale, { granularity: 'sentence' });
    } catch {
      try {
        seg = new Intl.Segmenter('und', { granularity: 'sentence' });
      } catch {
        return null;
      }
    }
    segmenterCache.set(locale, seg);
  }
  return seg;
}

/**
 * Conservative fallback for runtimes without `Intl.Segmenter` (Hermes).
 *
 * CJK sentence ends (。！？…) are ALWAYS boundaries — Japanese/Chinese text
 * has no inter-sentence whitespace, so a `\s+` requirement would merge the
 * whole paragraph into one segment (the saved-word context regression on
 * Hermes: word-saving stored the entire reader block). Latin ends (.!?)
 * still require whitespace (or closing quotes/brackets, or end-of-string)
 * so "Mr. " / "3.14" don't split; the abbreviation merge below handles
 * "Mr. " after the split.
 */
const FALLBACK_SENTENCE_END =
  /[。！？…]+[)\]»'"”’」』】〉》]*|[.!?]+[)\]»'"”’」』】〉》]*(?=\s|$)/g;

/** Exported for tests — exercises the Hermes/no-Intl.Segmenter path. */
export function segmentFallback(text: string): SentenceSegment[] {
  const out: SentenceSegment[] = [];
  let start = 0;
  FALLBACK_SENTENCE_END.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = FALLBACK_SENTENCE_END.exec(text))) {
    const end = m.index + m[0].length;
    out.push({ text: text.slice(start, end), start, end });
    start = end;
  }
  if (start < text.length) {
    out.push({ text: text.slice(start), start, end: text.length });
  }
  return out;
}

/**
 * Common Latin-script abbreviations that ICU splits after, missing from the
 * core UAX #29 suppression data. Kept small on purpose — see module docs.
 */
const LATIN_ABBREVIATIONS = new Set([
  'mr', 'mrs', 'ms', 'm', 'dr', 'st', 'mt', 'jr', 'sr',
  'prof', 'gen', 'col', 'capt', 'sgt', 'lt', 'rev', 'hon',
  'pres', 'sen', 'rep', 'gov', 'cpl', 'maj',
]);

/** True for a bare short capitalized Latin abbreviation like "Mr. " or "Dr. ". */
function isLatinAbbreviation(text: string): boolean {
  const m = /^([A-Z][a-z]{0,3})\.\s*$/.exec(text);
  return m ? LATIN_ABBREVIATIONS.has(m[1]!.toLowerCase()) : false;
}

/** Merge "Mr. " into the following segment so "Dr. Smith went home." stays whole.
 *  Exported for tests (exercises the Hermes fallback path end-to-end). */
export function mergeAbbreviationSegments(segs: SentenceSegment[]): SentenceSegment[] {
  if (segs.length < 2) return segs;
  const out: SentenceSegment[] = [];
  for (let i = 0; i < segs.length; i++) {
    const cur = segs[i]!;
    const next = segs[i + 1];
    if (next && isLatinAbbreviation(cur.text)) {
      out.push({ text: cur.text + next.text, start: cur.start, end: next.end });
      i++; // consume the merged next segment
    } else {
      out.push(cur);
    }
  }
  return out;
}

/**
 * Split text into sentences with offsets. Returns an empty array for empty
 * input. `locale` is a BCP-47 tag (e.g. 'en', 'zh', 'ja'); 'und' behaves as a
 * language-neutral default.
 */
export function segmentSentences(text: string, locale = 'und'): SentenceSegment[] {
  if (!text) return [];
  const segmenter = getSegmenter(locale);
  const raw: SentenceSegment[] = segmenter
    ? Array.from(segmenter.segment(text), (s) => ({
        text: s.segment,
        start: s.index,
        end: s.index + s.segment.length,
      }))
    : segmentFallback(text);
  return mergeAbbreviationSegments(raw);
}

/**
 * Returns the sentence (trimmed) containing the given UTF-16 character offset.
 * Offsets that land between sentences resolve to the nearest preceding
 * sentence; out-of-range offsets fall back to the full text.
 */
export function sentenceContaining(text: string, offset: number, locale = 'und'): string {
  if (!text || offset < 0 || offset > text.length) return text;
  const sentences = segmentSentences(text, locale);
  if (sentences.length === 0) return text;
  for (const s of sentences) {
    if (offset >= s.start && offset < s.end) return s.text.trim();
  }
  let prev = sentences[0]!;
  for (const s of sentences) {
    if (s.start > offset) break;
    prev = s;
  }
  return prev.text.trim();
}

/**
 * Returns the sentence containing the given token within `text`.
 * Token offsets are reconstructed by concatenating preceding token lengths;
 * if the tokens don't reconstruct the text exactly (e.g. tokenizer whitespace
 * normalization), falls back to locating the surface form by substring search,
 * then to the full text.
 */
export function sentenceForToken(
  text: string,
  tokens: LemmatizedToken[],
  token: LemmatizedToken,
  locale = 'und',
): string {
  if (!text || !token) return text;
  const index = tokens.indexOf(token);
  if (index !== -1) {
    const reconstructed = tokens.reduce((sum, t) => sum + t.text.length, 0);
    if (reconstructed === text.length) {
      let offset = 0;
      for (let i = 0; i < index; i++) offset += tokens[i]!.text.length;
      if (offset >= 0 && offset < text.length) {
        return sentenceContaining(text, offset, locale);
      }
    }
  }
  if (token.text) {
    const hit = text.indexOf(token.text);
    if (hit !== -1) return sentenceContaining(text, hit, locale);
  }
  return text;
}
