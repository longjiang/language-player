import type { LemmatizedToken } from '@langplayer/shared';

/**
 * Merge saved multi-token phrases into single atomic tokens.
 *
 * Saved words are highlighted by exact surface-form match
 * (`savedFormSet.has(token.text)`), so a phrase like 家賃滞納 that the
 * lemmatizer split into [家賃][滞納] can never light up as saved. This utility
 * collapses any contiguous token span that reconstructs to a saved phrase into
 * one token (e.g. `{ text: "家賃滞納", lemmas: [{ lemma: "家賃滞納" }] }`), so
 * the phrase highlights, clicks open its dictionary popup, and behaves as a
 * single unit everywhere downstream.
 *
 * Contract / safety:
 * - Tokens must reconstruct `text` exactly (same invariant TokenizedText
 *   relies on for markdown-format alignment); otherwise the input is returned
 *   unchanged.
 * - Only spans of ≥2 tokens are merged. A single-token "phrase" is already an
 *   atomic token and must keep its lemmas/pronunciation.
 * - A phrase is merged only when both its start and end land on token
 *   boundaries. Selections that split a token are left unmerged (the saved
 *   highlight then applies only where the surface form is already atomic).
 * - Overlapping phrases resolve longest-first: the most specific saved form
 *   wins, and shorter forms can't re-split a consumed span.
 * - Matching is case-insensitive; the merged token keeps the exact source
 *   slice so the output still reconstructs `text` character-for-character.
 */
export function mergePhraseTokens(
  text: string,
  tokens: LemmatizedToken[],
  phrases: string[],
): LemmatizedToken[] {
  if (tokens.length === 0 || phrases.length === 0) return tokens;

  // Reconstruct token boundaries; bail if tokens don't tile the text exactly.
  const bounds: Array<{ start: number; end: number }> = [];
  let total = 0;
  for (const t of tokens) {
    bounds.push({ start: total, end: total + t.text.length });
    total += t.text.length;
  }
  if (total !== text.length) return tokens;

  // Dedupe (case-insensitive), trim, and sort longest-first.
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const raw of phrases) {
    const phrase = raw.trim();
    const key = phrase.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(phrase);
  }
  unique.sort((a, b) => b.length - a.length);
  if (unique.length === 0) return tokens;

  // Index phrases by their first character so each token boundary only tries
  // candidates that could actually start there.
  const byFirstChar = new Map<string, string[]>();
  for (const phrase of unique) {
    const first = phrase[0]!.toLowerCase();
    const list = byFirstChar.get(first);
    if (list) list.push(phrase);
    else byFirstChar.set(first, [phrase]);
  }

  const lowerText = text.toLowerCase();
  const out: LemmatizedToken[] = [];
  let mergedAny = false;
  let i = 0;
  while (i < tokens.length) {
    const start = bounds[i]!.start;
    const candidates = byFirstChar.get(lowerText[start] ?? '') ?? [];
    let matched: { endIndex: number; endOffset: number } | null = null;

    for (const phrase of candidates) {
      const phraseLower = phrase.toLowerCase();
      const endOffset = start + phraseLower.length;
      if (endOffset > text.length) continue;
      if (lowerText.slice(start, endOffset) !== phraseLower) continue;

      // The phrase must end exactly on a token boundary.
      let j = i;
      while (j < tokens.length && bounds[j]!.end < endOffset) j++;
      if (j < tokens.length && bounds[j]!.end === endOffset && j > i) {
        matched = { endIndex: j, endOffset };
        break;
      }
    }

    if (matched) {
      mergedAny = true;
      const surface = text.slice(start, matched.endOffset);
      out.push({ text: surface, lemmas: [{ lemma: surface }] });
      i = matched.endIndex + 1;
    } else {
      out.push(tokens[i]!);
      i++;
    }
  }
  // Keep the original array identity when nothing was merged so downstream
  // memos stay stable.
  return mergedAny ? out : tokens;
}
