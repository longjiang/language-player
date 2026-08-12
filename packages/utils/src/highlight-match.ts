/**
 * Token-vs-saved-word matching for context highlighting (SPEC-066).
 *
 * A tokenizer may split an inflected surface form (e.g. 押し切られ →
 * 押し切ら + れ), so exact `token.text` comparison misses the saved word.
 * Matching against the token's lemmas (which resolve to the head form, e.g.
 * 押し切る) makes highlighting robust for inflected forms.
 */

export interface HighlightToken {
  text: string;
  lemmas: Array<{ lemma: string }>;
}

/** True when the token's surface or any lemma equals one of the terms. */
export function tokenMatchesAnyTerm(
  token: HighlightToken,
  terms: string[] | undefined,
): boolean {
  if (!terms || terms.length === 0) return false;
  return terms.some(
    (t) => t === token.text || token.lemmas.some((l) => l.lemma === t),
  );
}

/** True when the token's surface or any lemma is in the (lowercased) set. */
export function tokenMatchesAnyForm(
  token: HighlightToken,
  forms: ReadonlySet<string> | undefined,
): boolean {
  if (!forms || forms.size === 0) return false;
  const surface = token.text.toLowerCase();
  if (forms.has(surface) || forms.has(token.text)) return true;
  return token.lemmas.some((l) => {
    const lemma = l.lemma.toLowerCase();
    return forms.has(lemma) || forms.has(l.lemma);
  });
}
