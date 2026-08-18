import { describe, expect, it } from 'vitest';
import { lineOffsets } from './aligned-translation';

describe('lineOffsets', () => {
  it('maps a single line to the full text range', () => {
    expect(lineOffsets('hello world', [{ text: 'hello world' }])).toEqual([
      { start: 0, end: 11 },
    ]);
  });

  it('maps sequential wrapped lines, skipping the whitespace dropped at breaks', () => {
    const text = 'The quick brown fox jumps over the lazy dog.';
    const lines = [
      { text: 'The quick brown fox ' }, // trailing space dropped by layout
      { text: 'jumps over the lazy ' },
      { text: 'dog.' },
    ];
    expect(lineOffsets(text, lines)).toEqual([
      { start: 0, end: 19 },
      { start: 20, end: 39 },
      { start: 40, end: 44 },
    ]);
  });

  it('maps lines split at a newline', () => {
    const text = 'line one\nline two';
    expect(lineOffsets(text, [{ text: 'line one' }, { text: 'line two' }])).toEqual([
      { start: 0, end: 8 },
      { start: 9, end: 17 },
    ]);
  });

  it('skips whitespace-only lines without advancing', () => {
    const text = 'aaa bbb';
    expect(lineOffsets(text, [{ text: 'aaa' }, { text: ' ' }, { text: 'bbb' }])).toEqual([
      { start: 0, end: 3 },
      { start: 3, end: 3 },
      { start: 4, end: 7 },
    ]);
  });

  it('falls back to a positional slice when a line text cannot be matched', () => {
    const text = 'abcdef';
    // "xy" appears nowhere; falls back to the current position with the
    // same length so offsets stay monotonic.
    expect(lineOffsets(text, [{ text: 'xy' }, { text: 'def' }])).toEqual([
      { start: 0, end: 2 },
      { start: 3, end: 6 },
    ]);
  });

  it('handles repeated words without re-matching earlier occurrences', () => {
    const text = 'la la land';
    expect(lineOffsets(text, [{ text: 'la ' }, { text: 'la ' }, { text: 'land' }])).toEqual([
      { start: 0, end: 2 },
      { start: 3, end: 5 },
      { start: 6, end: 10 },
    ]);
  });
});
