/**
 * How wide a string is, in ems — for sizing a text field to the answer it holds.
 *
 * Written because `ch` is the wrong unit for it and the bug was invisible in review: `1ch`
 * is the width of the font's `0`, about **half an em**, while a CJK glyph is a **full em**. A
 * blank printed for a two-character answer (一般) was therefore given `3ch ≈ 1.5em`, and the
 * input's own overflow cut the second character in half — the student could not read back what
 * they had typed, and a wrong answer being longer than the right one is the normal case.
 *
 * An em is also the element's own font size, so a width computed in ems keeps its proportion
 * at any text scale, which px would not.
 *
 * Deliberately an over-estimate rather than a measurement: a field that is a little wide is
 * harmless, one that is a little narrow hides text. Half an em per non-CJK character assumes a
 * proportional face; a monospace answer would be under-estimated by half, which is why callers
 * add their own padding.
 */
export function glyphEms(text: string): number {
  let ems = 0;
  for (const char of text) ems += isWideGlyph(char) ? 1 : 0.5;
  return ems;
}

/**
 * Whether a character is drawn full-width: Han, the kana, Hangul, and the fullwidth forms.
 *
 * The ranges are the ones this app's answers actually use (Chinese, Japanese, Korean) — it is
 * a sizing hint, not a Unicode text-width implementation, so a script the app does not teach
 * falls through to the half-em default.
 */
export function isWideGlyph(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  return (
    (code >= 0x1100 && code <= 0x115f) || // Hangul Jamo
    (code >= 0x2e80 && code <= 0x303e) || // CJK radicals, Kangxi, CJK punctuation
    (code >= 0x3041 && code <= 0x33ff) || // kana, Hangul compatibility jamo, CJK compatibility
    (code >= 0x3400 && code <= 0x4dbf) || // CJK Extension A
    (code >= 0x4e00 && code <= 0x9fff) || // CJK Unified Ideographs
    (code >= 0xa000 && code <= 0xa4cf) || // Yi
    (code >= 0xac00 && code <= 0xd7a3) || // Hangul syllables
    (code >= 0xf900 && code <= 0xfaff) || // CJK compatibility ideographs
    (code >= 0xfe30 && code <= 0xfe6f) || // CJK compatibility forms
    (code >= 0xff00 && code <= 0xff60) || // fullwidth forms
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x20000 && code <= 0x3fffd) // CJK Extension B and beyond
  );
}
