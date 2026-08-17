import { describe, expect, it } from 'vitest';
import {
  blockIndexAtChars,
  firstBreakAfter,
  globalPageOfBlock,
  lastBreakAtOrBefore,
} from './use-css-columns-pager';

/** charsBefore for blocks with the given char lengths. */
function charsBeforeOf(lengths: number[]): (i: number) => number {
  const prefix = [0];
  for (const len of lengths) prefix.push(prefix[prefix.length - 1]! + len);
  return (i: number) => {
    if (i <= 0) return 0;
    if (i >= prefix.length) return prefix[prefix.length - 1]!;
    return prefix[i]!;
  };
}

describe('globalPageOfBlock', () => {
  const lengths = [50, 60, 70, 40, 90, 30, 20, 80]; // B0..B7
  const cb = charsBeforeOf(lengths);

  it('counts verified breaks exactly and estimates unmeasured stretches', () => {
    // No verified breaks: pure chars-per-page estimate.
    expect(globalPageOfBlock([], cb, 100, 0)).toBe(1);
    expect(globalPageOfBlock([], cb, 100, 1)).toBe(1); // 50 chars — still page 1
    expect(globalPageOfBlock([], cb, 100, 2)).toBe(2); // 110 chars → page 2
    expect(globalPageOfBlock([], cb, 100, 7)).toBe(4); // 360 chars → block on page 4
  });

  it('treats every verified break as one page', () => {
    // Breaks at B1 (page 2) and B2 (page 3).
    expect(globalPageOfBlock([1, 2], cb, 100, 0)).toBe(1);
    expect(globalPageOfBlock([1, 2], cb, 100, 1)).toBe(2);
    expect(globalPageOfBlock([1, 2], cb, 100, 2)).toBe(3);
    expect(globalPageOfBlock([1, 2], cb, 100, 7)).toBe(4); // 180 tail chars → one more page
  });

  it('handles adjacent breaks (zero-char gaps) as consecutive pages', () => {
    // Breaks at B2 and B3: B2 starts page 3, B3 starts page 4.
    expect(globalPageOfBlock([2, 3], cb, 100, 3)).toBe(4);
    expect(globalPageOfBlock([2, 3], cb, 100, 5)).toBe(4); // tail after B3 fits one page
  });

  it('is monotonic in blockIndex', () => {
    const breaks = [1, 4, 6];
    let prev = 0;
    for (let i = 0; i < lengths.length; i++) {
      const p = globalPageOfBlock(breaks, cb, 100, i);
      expect(p).toBeGreaterThanOrEqual(prev);
      prev = p;
    }
  });
});

describe('blockIndexAtChars', () => {
  const lengths = [50, 60, 70, 40];
  const cb = charsBeforeOf(lengths);

  it('finds the first block whose cumulative chars reach the target', () => {
    expect(blockIndexAtChars(4, cb, 0)).toBe(0);
    expect(blockIndexAtChars(4, cb, 49)).toBe(0);
    expect(blockIndexAtChars(4, cb, 50)).toBe(1);
    expect(blockIndexAtChars(4, cb, 110)).toBe(2);
    expect(blockIndexAtChars(4, cb, 9999)).toBe(3); // clamp to last block
  });

  it('returns 0 for empty streams', () => {
    expect(blockIndexAtChars(0, cb, 50)).toBe(0);
  });
});

describe('lastBreakAtOrBefore / firstBreakAfter', () => {
  const breaks = [0, 3, 7, 12];

  it('finds the boundary breaks', () => {
    expect(lastBreakAtOrBefore(breaks, 2)).toBe(0);
    expect(lastBreakAtOrBefore(breaks, 3)).toBe(3);
    expect(lastBreakAtOrBefore(breaks, 11)).toBe(7);
    expect(lastBreakAtOrBefore(breaks, 12)).toBe(12);
    expect(lastBreakAtOrBefore(breaks, 99)).toBe(12);
    expect(lastBreakAtOrBefore([], 5)).toBeNull();
    expect(lastBreakAtOrBefore(breaks, -1)).toBeNull();
  });

  it('finds the next boundary break', () => {
    expect(firstBreakAfter(breaks, 0)).toBe(3);
    expect(firstBreakAfter(breaks, 2)).toBe(3);
    expect(firstBreakAfter(breaks, 3)).toBe(7);
    expect(firstBreakAfter(breaks, 12)).toBeNull();
    expect(firstBreakAfter([], 0)).toBeNull();
  });
});
