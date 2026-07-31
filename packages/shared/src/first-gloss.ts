/**
 * Shared utility — returns the first gloss segment from dictionary definitions.
 *
 * Takes the definitions array from a LexicalEntry (DictionaryEntry or LlmGeneratedEntry),
 * picks the first non-empty definition, splits it on sentence-segmenting punctuation
 * (semicolons and commas in both half-width and full-width forms), and returns the
 * first segment trimmed.
 *
 * Used by quick gloss and interlinear definition rendering in both apps/web and apps/mobile.
 *
 * Examples:
 *   firstGloss(["pork, pig meat, ham", "bacon"])  → "pork"
 *   firstGloss(["hello；goodbye，see you"])          → "hello"
 *   firstGloss([])                                   → null
 *   firstGloss(["", "only second"])                  → "only second"
 */
export function firstGloss(definitions: string[]): string | null {
  for (const def of definitions) {
    if (!def) continue;
    // Split on half-width and full-width semicolons and commas
    const firstSegment = def.split(/[,;，；]/)[0];
    if (firstSegment) {
      return firstSegment.trim();
    }
  }
  return null;
}
