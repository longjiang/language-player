/**
 * Rendered→source offset mapping for native text selection on tokenized text
 * (SPEC-084 Task 4).
 *
 * RN's `Text`/native paragraph selection reports offsets into the RENDERED
 * string, which can differ from the source `text` (script conversion,
 * phonetics-replace mode, quiz blanks, leading first-line indent). This module
 * rebuilds the exact rendered string from the display tokens and maps any
 * rendered range back to the selected text (the lookup term, web parity:
 * "the visible pronunciation/glyphs become the lookup term as-is") and to a
 * source-text offset for sentence context (web's `startOffset`, with the same
 * substring-search fallback at the call site).
 *
 * Kept free of React/RN imports so it is unit-testable in the node vitest
 * environment.
 */

export interface SelectionMapToken {
  /** Source text of the token (tokens concatenate back to the block text). */
  text: string;
  /** Text as displayed (script conversion, phonetics-replace, quiz blank). */
  displayText: string;
}

export interface SelectionRenderedMap {
  /** Exact rendered string: displayTexts concatenated, optional indent. */
  rendered: string;
  /** Rendered start offset of each token's displayText. */
  renderedStarts: number[];
  /** Source start offset of each token's text. */
  sourceStarts: number[];
}

/** Indent char prepended by firstLineIndent (U+3000 ideographic space). */
export const SELECTION_INDENT = '\u3000';

/**
 * Build the rendered string + per-token offset tables for a block's display
 * tokens. `leadingIndent` mirrors TokenizedText's firstLineIndent (one U+3000
 * prefix, same as the render paths).
 */
export function buildSelectionMap(
  tokens: SelectionMapToken[],
  leadingIndent = false,
): SelectionRenderedMap {
  let rendered = leadingIndent ? SELECTION_INDENT : '';
  const renderedStarts: number[] = [];
  const sourceStarts: number[] = [];
  let srcPos = 0;
  for (const t of tokens) {
    renderedStarts.push(rendered.length);
    sourceStarts.push(srcPos);
    rendered += t.displayText;
    srcPos += t.text.length;
  }
  return { rendered, renderedStarts, sourceStarts };
}

/** Index of the token whose display contains the (clamped) rendered offset. */
function tokenIndexAt(map: SelectionRenderedMap, renderedOffset: number): number {
  const o = Math.max(0, Math.min(renderedOffset, map.rendered.length));
  for (let i = map.renderedStarts.length - 1; i >= 0; i--) {
    if (map.renderedStarts[i]! <= o) return i;
  }
  return 0;
}

/**
 * The selected text as displayed — the lookup term (web parity: selected
 * visible glyphs/pronunciation are used as-is). Clamped to the rendered
 * string bounds.
 */
export function selectionTermAt(
  map: SelectionRenderedMap,
  start: number,
  end: number,
): string {
  return map.rendered.slice(Math.max(0, start), Math.max(0, end));
}

/**
 * Source-text offset of the token containing the rendered offset (for
 * sentence context), or null when the block has no renderable text.
 */
export function selectionSourceOffset(
  map: SelectionRenderedMap,
  renderedOffset: number,
): number | null {
  if (map.rendered.length === 0 || map.sourceStarts.length === 0) return null;
  const idx = tokenIndexAt(map, renderedOffset);
  return map.sourceStarts[idx] ?? null;
}
