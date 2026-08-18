/**
 * Pure helpers for reader translation baseline alignment (SPEC-082 web
 * AlignedTranslation parity, mobile adaptation).
 *
 * React Native has no DOM line-box API, so the L2 line grid comes from
 * `onTextLayout` on the same invisible RN Text that sizes the native ruby
 * paragraph (RubyTextParagraph), and the translation's visual lines come
 * from `onTextLayout` on a hidden probe Text. The line layout engine gives
 * each line's text directly, but NOT its offset into the source string —
 * `lineOffsets` reconstructs those offsets so per-line rendering can keep
 * the active-sentence highlight (SPEC-082 Task 4) aligned to the source.
 */

import type { TextLayoutEvent } from 'react-native';

/** Shape of one measured text line (RN's TextLayoutLine is not exported
 *  from the public react-native types in this SDK, so derive it). */
export type TextLayoutLine = TextLayoutEvent['nativeEvent']['lines'][number];

/**
 * Map probe line texts back to offsets in the original `text`.
 *
 * Lines are produced in order and concatenate back to `text` (the layout
 * engine drops the whitespace at line breaks — the trailing space of a
 * wrapped line, newlines, etc.), so a sequential scan for each trimmed line
 * text finds its true position. Falls back to a positional slice when a line
 * can't be matched (shouldn't happen; keeps offsets monotonic either way).
 */
export function lineOffsets(
  text: string,
  lines: ReadonlyArray<{ text: string }>,
): Array<{ start: number; end: number }> {
  const out: Array<{ start: number; end: number }> = [];
  let pos = 0;
  for (const ln of lines) {
    const lt = ln.text.trim();
    if (!lt) {
      out.push({ start: pos, end: pos });
      continue;
    }
    const s = text.indexOf(lt, pos);
    if (s === -1) {
      // Unmatched (e.g. layout normalized the whitespace) — keep offsets
      // monotonic with a positional slice of the same length.
      const end = Math.min(text.length, pos + lt.length);
      out.push({ start: pos, end });
      pos = end;
      continue;
    }
    out.push({ start: s, end: s + lt.length });
    pos = s + lt.length;
  }
  return out;
}
