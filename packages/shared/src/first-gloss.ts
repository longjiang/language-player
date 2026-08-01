/**
 * Shared utility — returns the first gloss segment from dictionary definitions.
 *
 * Takes the definitions array from a LexicalEntry (DictionaryEntry or LlmGeneratedEntry),
 * strips parenthetical content (half-width ( ) [ ], full-width （ ） ［ ］, and CJK
 * 【 】), picks the first non-empty definition, splits it on sentence-segmenting
 * punctuation (commas, semicolons, and colons in both half-width and full-width
 * forms), and returns the first segment trimmed.
 *
 * Used by quick gloss and interlinear definition rendering in both apps/web and apps/mobile.
 *
 * Examples:
 *   firstGloss(["pork, pig meat, ham", "bacon"])      → "pork"
 *   firstGloss(["hello；goodbye，see you"])              → "hello"
 *   firstGloss(["note: see below"])                    → "note"
 *   firstGloss(["eat (food), consume"])               → "eat"
 *   firstGloss(["（表示惊讶）吃惊，惊讶"])                  → "吃惊"
 *   firstGloss(["go [to a place], travel"])           → "go"
 *   firstGloss([])                                   → null
 *   firstGloss(["", "only second"])                  → "only second"
 */

/** Bracket pairs treated as parenthetical content, in half-width and full-width forms. */
const PAREN_PAIRS: ReadonlyArray<readonly [open: string, close: string]> = [
  ['(', ')'],
  ['[', ']'],
  ['（', '）'],
  ['［', '］'],
  ['【', '】'],
];

/**
 * Remove parenthetical content from a definition, including nested groups.
 *
 * Handles half-width ( ) [ ], full-width （ ） ［ ］, and CJK 【 】. Content inside any
 * pair is dropped entirely, including nested pairs of a different bracket type.
 */
function stripParenthetical(text: string): string {
  const openerToCloser = new Map(PAREN_PAIRS);
  const closers = new Set(PAREN_PAIRS.map(([, close]) => close));
  let out = '';
  const stack: string[] = [];
  for (const ch of text) {
    const closer = openerToCloser.get(ch);
    if (closer) {
      stack.push(closer);
      continue;
    }
    if (stack.length > 0) {
      if (closers.has(ch) && ch === stack[stack.length - 1]!) stack.pop();
      continue;
    }
    out += ch;
  }
  return out;
}

export function firstGloss(definitions: string[]): string | null {
  for (const def of definitions) {
    if (!def) continue;
    const stripped = stripParenthetical(def);
    // Split on half-width and full-width commas, semicolons, and colons
    const firstSegment = stripped.split(/[,;，；:：]/)[0];
    if (firstSegment) {
      const gloss = firstSegment.trim().replace(/\s{2,}/g, ' ');
      if (gloss) return gloss;
    }
  }
  return null;
}
