import { describe, it, expect } from 'vitest';
import { findTextMatches } from './text-search';

describe('findTextMatches (invisible-char-robust reader search)', () => {
  const text = '杨琦无奈，只得高高掀起车上的珠帘。汉献帝亲口说道：\u200B“朕就在此，卿等为何还不退？\u200B”';

  it('matches across a zero-width space between “：” and ““”', () => {
    const m = findTextMatches(text, '：“');
    expect(m.length).toBe(1);
    // Original text is 杨…说(道)：(FF1A) \u200B “(201C)…
    const colonIdx = text.indexOf('：');
    const quoteIdx = text.indexOf('“');
    expect(m[0]).toEqual({ start: colonIdx, end: quoteIdx + 1 });
  });

  it('matches the full sentence even though it contains zero-width spaces', () => {
    const m = findTextMatches(text, '杨琦无奈，只得高高掀起车上的珠帘。汉献帝亲口说道：“朕就在此，卿等为何还不退？”');
    expect(m.length).toBe(1);
    expect(m[0]).toEqual({ start: 0, end: text.length });
  });

  it('matches across a newline / whitespace run', () => {
    const m = findTextMatches('foo\n\nbar baz', 'foo bar');
    expect(m.length).toBe(1);
    // The match spans "foo\n\nbar" in the ORIGINAL text (the \n\n run maps to
    // the collapse-space), exclusive end at the 'r'.
    expect(m[0]).toEqual({ start: 0, end: 8 });
  });

  it('is case-insensitive and reports original-coordinate indices', () => {
    const m = findTextMatches('Hello World', 'hello');
    expect(m[0]).toEqual({ start: 0, end: 5 });
  });

  it('does not match across a real word boundary that is not whitespace', () => {
    expect(findTextMatches('foobar', 'foo bar')).toEqual([]);
  });

  it('returns no matches for an empty/whitespace-only query', () => {
    expect(findTextMatches(text, '   ')).toEqual([]);
    expect(findTextMatches(text, '\u200B\u200B')).toEqual([]);
  });

  it('honours the result limit', () => {
    const m = findTextMatches('a b a b a b', 'a', 2);
    expect(m.length).toBe(2);
  });
});
