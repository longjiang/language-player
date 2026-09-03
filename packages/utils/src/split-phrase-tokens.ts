import type { LemmatizedToken } from '@langplayer/shared';

/**
 * Split tokens that a saved/search phrase crosses into an atomic phrase token
 * plus placeholder fragments (SPEC-033 cross-boundary retokenization).
 *
 * `mergePhraseTokens` can only merge phrases whose start AND end land on
 * token boundaries. A phrase like 掘藏 inside 想掘｜藏 (Jieba: 想掘 + 藏)
 * starts mid-token, so it can never merge — and because saved/highlight
 * matching is whole-token, the phrase never highlights in the source text or
 * in the SRS review context sentence.
 *
 * This utility retokenizes those spans: the phrase becomes one atomic token
 * (`{ text: <source slice>, lemmas: [{ lemma: <source slice>] }`, the same
 * shape mergePhraseTokens emits) and each leftover partial token becomes a
 * placeholder fragment (`lemmas: []`) that the consumer MUST re-lemmatize
 * (e.g. via /lemmatize-normalized) to restore its own lemma and pronunciation
 * (想 from 想掘) before splicing back.
 *
 * Contract / safety:
 * - Tokens must reconstruct `text` exactly (same invariant TokenizedText
 *   relies on for markdown-format alignment); otherwise the input is
 *   returned unchanged.
 * - Total length is preserved: the phrase token carries the exact source
 *   slice and placeholders carry the leftover slices, so the output still
 *   tiles `text` character-for-character and format offsets, karaoke pacing,
 *   and sentence context stay aligned.
 * - Only spaceless-script phrases (Han / Kana / Thai / Lao / Khmer — scripts
 *   written without inter-word spaces) split, and only when at least one
 *   edge of the occurrence lands mid-token. Space-delimited languages are
 *   excluded: a short saved form like "he" would otherwise shred every token
 *   containing it, and their inflected forms already align to whole tokens.
 * - Boundary-aligned occurrences (both edges on token boundaries) are left
 *   untouched — `mergePhraseTokens` collapses multi-token ones, and a
 *   single-token phrase must keep its original lemmas/pronunciation.
 * - Occurrences are claimed longest-first, non-overlapping, and never share
 *   a token: two occurrences that touch the same token cannot both split,
 *   so the earlier (leftmost, longest-first) wins and the later stays whole.
 * - Run BEFORE mergePhraseTokens; the two compose (split handles
 *   boundary-crossing spans, merge collapses boundary-aligned ones).
 */

/** Characters from scripts written without spaces between words. Includes
 *  the kana prolonged-sound mark (ー) and voiced marks, which Unicode tags
 *  Script=Common despite belonging to kana words. */
const SPACELESS_CHAR =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\u30FC\u309B\u309C\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}]/u;

/** A phrase eligible for splitting: ≥2 characters, starting and ending in a
 *  spaceless script (internal punctuation/spaces are allowed). */
function isSplittablePhrase(phrase: string): boolean {
  if (phrase.length < 2) return false;
  const chars = [...phrase];
  return SPACELESS_CHAR.test(chars[0]!) && SPACELESS_CHAR.test(chars[chars.length - 1]!);
}

export interface SplitPhraseTokensResult {
  /** Retokenized tokens (the input array identity when nothing split). */
  tokens: LemmatizedToken[];
  /** Placeholder fragments created by the split. The consumer re-lemmatizes
   *  these (keyed by `text`) and splices the results back — only when the
   *  re-lemmatized tokens tile the placeholder exactly. */
  placeholders: LemmatizedToken[];
}

export function splitPhraseTokens(
  text: string,
  tokens: LemmatizedToken[],
  phrases: string[],
): SplitPhraseTokensResult {
  if (tokens.length === 0 || phrases.length === 0) return { tokens, placeholders: [] };

  // Reconstruct token boundaries; bail if tokens don't tile the text exactly.
  const bounds: Array<{ start: number; end: number }> = [];
  let total = 0;
  for (const t of tokens) {
    bounds.push({ start: total, end: total + t.text.length });
    total += t.text.length;
  }
  if (total !== text.length) return { tokens, placeholders: [] };

  // Filter to spaceless-script phrases, dedupe (case-insensitive), sort
  // longest-first.
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const raw of phrases) {
    const phrase = raw.trim();
    const key = phrase.toLowerCase();
    if (!key || seen.has(key) || !isSplittablePhrase(phrase)) continue;
    seen.add(key);
    unique.push(phrase);
  }
  unique.sort((a, b) => b.length - a.length);
  if (unique.length === 0) return { tokens, placeholders: [] };

  const lowerText = text.toLowerCase();

  // Claim occurrences longest-first: non-overlapping, and no two claimed
  // occurrences may touch the same token (their leftover fragments would
  // overlap). Boundary-aligned occurrences are skipped — mergePhraseTokens
  // collapses those, and single-token phrases must keep their lemmas.
  const accepted: Array<{ start: number; end: number; first: number; last: number }> = [];
  for (const phrase of unique) {
    const phraseLower = phrase.toLowerCase();
    const len = phraseLower.length;
    let from = 0;
    for (;;) {
      const idx = lowerText.indexOf(phraseLower, from);
      if (idx === -1) break;
      from = idx + 1;
      // Token range touched by the occurrence.
      let first = 0;
      while (first < tokens.length && bounds[first]!.end <= idx) first++;
      let last = first;
      while (last < tokens.length && bounds[last]!.end < idx + len) last++;
      if (first >= tokens.length || last >= tokens.length) break;
      // Both edges on token boundaries → merge/exact-match territory.
      if (bounds[first]!.start === idx && bounds[last]!.end === idx + len) continue;
      // Shares a token with an already-claimed occurrence → skip.
      if (accepted.some((o) => o.last >= first && o.first <= last)) continue;
      accepted.push({ start: idx, end: idx + len, first, last });
      from = idx + len; // the same phrase never overlaps itself
    }
  }
  if (accepted.length === 0) return { tokens, placeholders: [] };
  accepted.sort((a, b) => a.start - b.start);

  // Emit: whole tokens before each occurrence, leftover head/tail fragments
  // as placeholders, the phrase as one atomic token.
  const out: LemmatizedToken[] = [];
  const placeholders: LemmatizedToken[] = [];
  const pushPlaceholder = (slice: string) => {
    if (!slice) return;
    const p: LemmatizedToken = { text: slice, lemmas: [] };
    placeholders.push(p);
    out.push(p);
  };
  let cursor = 0;
  for (const occ of accepted) {
    // Whole tokens that end at or before the occurrence.
    while (cursor < tokens.length && bounds[cursor]!.end <= occ.start) {
      out.push(tokens[cursor]!);
      cursor++;
    }
    // Head fragment: the cursor token straddles the occurrence start. The
    // cursor is NOT advanced — the same token may also straddle the end.
    if (cursor < tokens.length && bounds[cursor]!.start < occ.start) {
      pushPlaceholder(text.slice(bounds[cursor]!.start, occ.start));
    }
    const slice = text.slice(occ.start, occ.end);
    out.push({ text: slice, lemmas: [{ lemma: slice }] });
    // Tokens fully covered by the phrase.
    while (cursor < tokens.length && bounds[cursor]!.end <= occ.end) cursor++;
    // Tail fragment: the cursor token straddles the occurrence end.
    if (cursor < tokens.length && bounds[cursor]!.start < occ.end) {
      pushPlaceholder(text.slice(occ.end, bounds[cursor]!.end));
      cursor++;
    }
  }
  while (cursor < tokens.length) {
    out.push(tokens[cursor]!);
    cursor++;
  }
  return { tokens: out, placeholders };
}
