import { describe, expect, it } from 'vitest';

import {
  collectRareCodePoints,
  isRareHanCodePoint,
  rareFontFamily,
  rareGlyphLabel,
  rareGlyphParam,
  splitRareGlyphRuns,
} from './rare-glyphs';

describe('rare Han helpers', () => {
  it('recognises Extension B–J and excludes URO/Extension A', () => {
    for (const cp of [0x20000, 0x26030, 0x2a6df, 0x2a700, 0x2b81f, 0x2ebf0, 0x30000, 0x323b0, 0x3347f]) {
      expect(isRareHanCodePoint(cp)).toBe(true);
    }
    for (const cp of [0x4e00, 0x3400, 0x9fff, 0x41, -1]) {
      expect(isRareHanCodePoint(cp)).toBe(false);
    }
  });

  it('collects unique rare codepoints in order', () => {
    expect(collectRareCodePoints('遠將𦀰像𦀰')).toEqual([0x26030]);
    expect(collectRareCodePoints('𠀀𠀁')).toEqual([0x20000, 0x20001]);
    expect(collectRareCodePoints('普通文字')).toEqual([]);
  });

  it('splits ordinary and rare runs without dropping text', () => {
    expect(splitRareGlyphRuns('遠將𦀰像')).toEqual([
      { kind: 'text', text: '遠將' },
      { kind: 'rare', text: '𦀰', codePoint: 0x26030, label: 'U+26030' },
      { kind: 'text', text: '像' },
    ]);
  });

  it('does not split surrogate pairs', () => {
    const runs = splitRareGlyphRuns('A𦀰B');
    expect(runs.map((r) => r.text)).toEqual(['A', '𦀰', 'B']);
    expect(runs[1]).toMatchObject({ kind: 'rare', codePoint: 0x26030 });
  });

  it('formats labels, params, and font families', () => {
    expect(rareGlyphLabel(0x26030)).toBe('U+26030');
    expect(rareGlyphLabel(0x20000)).toBe('U+20000');
    expect(rareGlyphParam([0x2a6d6, 0x26030, 0x26030])).toBe('26030,2a6d6');
    expect(rareFontFamily('f3c1a9e2b7d4')).toBe('LPRareHan-f3c1a9e2b7d4');
  });
});
