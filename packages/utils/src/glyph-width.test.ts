import { describe, expect, it } from 'vitest';
import { glyphEms } from './glyph-width';

/**
 * Sizing a typed blank. The unit matters: `1ch` is half an em in a proportional face, so a
 * two-character CJK answer did not fit the `chars + 1` ch that was computed for it and the
 * input's overflow cut it in half.
 */
describe('glyphEms', () => {
  it('counts a CJK glyph as a full em', () => {
    expect(glyphEms('一般')).toBe(2);
    expect(glyphEms('差不多')).toBe(3);
    expect(glyphEms('趟')).toBe(1);
  });

  it('counts latin, digits and punctuation as half an em', () => {
    expect(glyphEms('abc')).toBe(1.5);
    expect(glyphEms('1234567890')).toBe(5);
    expect(glyphEms('Wi-Fi')).toBe(2.5);
  });

  it('is empty for empty text, so a blank keeps its printed width', () => {
    expect(glyphEms('')).toBe(0);
  });

  it('handles kana and hangul as full width too', () => {
    expect(glyphEms('ひらがな')).toBe(4);
    expect(glyphEms('한국어')).toBe(3);
  });
});
