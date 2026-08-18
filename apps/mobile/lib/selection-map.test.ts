/**
 * Tests for the rendered→source selection map (SPEC-084 Task 4).
 * The map is what lets native text-selection offsets (into the rendered
 * string) produce the lookup term and a source-text offset for sentence
 * context.
 */

import { describe, expect, it } from 'vitest';
import {
  buildSelectionMap,
  selectionSourceOffset,
  selectionTermAt,
} from './selection-map';

const T = (text: string, displayText = text) => ({ text, displayText });

describe('buildSelectionMap / selectionTermAt — identity display', () => {
  it('maps a rendered range to the same substring for identity display', () => {
    const map = buildSelectionMap([
      T('漢字'),
      T('を'),
      T('読む'),
      T('。'),
    ]);
    expect(map.rendered).toBe('漢字を読む。');
    // Select "字を読" → rendered [1, 4)
    expect(selectionTermAt(map, 1, 4)).toBe('字を読');
    expect(selectionSourceOffset(map, 1)).toBe(0);
  });
});

describe('script conversion (same-length 1:1 mapping)', () => {
  it('selects the converted glyphs as the lookup term', () => {
    const map = buildSelectionMap([
      T('台湾', '臺灣'),
      T(' ', ' '),
      T('电影', '電影'),
    ]);
    expect(map.rendered).toBe('臺灣 電影');
    expect(selectionTermAt(map, 0, 2)).toBe('臺灣');
    expect(selectionSourceOffset(map, 0)).toBe(0);
    expect(selectionSourceOffset(map, 3)).toBe(3); // 電 at rendered 3 → 电影 source start 3
  });
});

describe('phonetics-replace (length changes)', () => {
  it('uses the visible pronunciation as the term, source offset from the token', () => {
    const map = buildSelectionMap([
      T('漢字', 'かんじ'),
      T('を', 'を'),
      T('読む', 'よむ'),
    ]);
    expect(map.rendered).toBe('かんじをよむ');
    // Select the first pronunciation "かんじ" → rendered [0, 3)
    expect(selectionTermAt(map, 0, 3)).toBe('かんじ');
    // Source offset points at the start of the 漢字 token (source 0).
    expect(selectionSourceOffset(map, 0)).toBe(0);
    // Select across the boundary: "じを" → rendered [2, 4)
    expect(selectionTermAt(map, 2, 4)).toBe('じを');
  });
});

describe('quiz blanks', () => {
  it('maps blanked tokens to their ▯ display and the token source start', () => {
    const map = buildSelectionMap([
      T('これ', '▯'),
      T('は', 'は'),
      T('本', '▯'),
    ]);
    expect(map.rendered).toBe('▯は▯');
    expect(selectionTermAt(map, 0, 1)).toBe('▯');
    expect(selectionSourceOffset(map, 0)).toBe(0);
    expect(selectionSourceOffset(map, 2)).toBe(3); // 本 starts at source 3
  });
});

describe('first-line indent', () => {
  it('shifts rendered offsets by the indent char', () => {
    const map = buildSelectionMap([T('hello'), T(' '), T('world')], true);
    expect(map.rendered).toBe('\u3000hello world');
    // Selection starting at rendered 0 (the indent) still maps to token 0.
    expect(selectionTermAt(map, 0, 5)).toBe('\u3000hell');
    expect(selectionSourceOffset(map, 0)).toBe(0);
    expect(selectionSourceOffset(map, 1)).toBe(0);
    // "world" at rendered [7, 12) → source starts at 6.
    expect(selectionTermAt(map, 7, 12)).toBe('world');
    expect(selectionSourceOffset(map, 7)).toBe(6);
  });
});

describe('empty / clamping', () => {
  it('handles empty blocks and out-of-range offsets', () => {
    const map = buildSelectionMap([]);
    expect(selectionTermAt(map, 0, 5)).toBe('');
    expect(selectionSourceOffset(map, 0)).toBeNull();
  });

  it('clamps oversized ranges to the rendered length', () => {
    const map = buildSelectionMap([T('abc')]);
    expect(selectionTermAt(map, -2, 99)).toBe('abc');
  });
});
