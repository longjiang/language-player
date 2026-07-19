/**
 * Remove terms that are substrings of other terms.
 *
 * If term A contains term B as a substring, A is redundant for search —
 * searching for B already matches every line that contains A.
 *
 *   mutuallyExclusive(["dièdres", "dièdre"]) → ["dièdre"]
 *   mutuallyExclusive(["吃饭", "吃", "chīfàn"]) → ["吃", "chīfàn"]
 */
export function mutuallyExclusive(terms: string[]): string[] {
  const result: string[] = [];
  for (const term of terms) {
    let pass = true;
    for (const other of terms) {
      if (term !== other && term.includes(other)) {
        pass = false;
        break;
      }
    }
    if (pass) result.push(term);
  }
  return result;
}

/**
 * Deduplicate and sort search terms, then remove redundant (substring) terms.
 *
 * @param terms — all candidate search terms (script variants + inflected forms)
 * @param optimalLength — sort by closeness to this length (usually head.length - 1)
 * @returns deduplicated, non-redundant terms
 */
export function dedupeSearchTerms(
  terms: string[],
  optimalLength: number,
): string[] {
  const unique = [...new Set(terms)];
  unique.sort(
    (a, b) =>
      Math.abs(a.length - optimalLength) -
      Math.abs(b.length - optimalLength),
  );
  return mutuallyExclusive(unique);
}
