import { describe, expect, it } from 'vitest';
import {
  computeBackwardStart,
  computeForwardEnd,
  startsNewSpine,
  type BreakInput,
} from './use-paginated-reader';

/**
 * Build a block window. Each element maps to one "block": `spinesOffset[i]`
 * is the spine document the block belongs to (0-based *span* of documents, not
 * absolute indices — only equality between neighbours matters) and `height`
 * its rendered height.
 */
function win(spines: number[], heights: number[]): BreakInput[] {
  return spines.map((spineIndex, i) => ({ spineIndex, height: heights[i]! }));
}

const SPINE_A = 0; // e.g. 1Q84 第１章 (one document)
const SPINE_B = 1; // 第２章
const SPINE_C = 2; // 第３章

describe('startsNewSpine', () => {
  it('flags the first block of each new document', () => {
    const w = win([SPINE_A, SPINE_A, SPINE_B, SPINE_C, SPINE_C], [10, 10, 10, 10, 10]);
    expect(startsNewSpine(w, 0)).toBe(false); // very first block
    expect(startsNewSpine(w, 1)).toBe(false); // same spine
    expect(startsNewSpine(w, 2)).toBe(true);  // SPINE_B begins
    expect(startsNewSpine(w, 3)).toBe(true);  // SPINE_C begins
    expect(startsNewSpine(w, 4)).toBe(false); // same spine
  });
});

describe('computeForwardEnd (new spine = new page)', () => {
  it('breaks before a document that would otherwise fit on the page', () => {
    // 2 blocks of spine A (20px) on a 100px-tall page, then spine B's chapter
    // title (10px) WOULD fit — but the spine boundary forces a break at its
    // index (2).
    const w = win([SPINE_A, SPINE_A, SPINE_B], [10, 10, 10]);
    expect(computeForwardEnd(w, 100)).toBe(2);
  });

  it('does not add an empty page at the very start of a window', () => {
    // Window begins exactly on a new spine: no break inserted before block 0.
    const w = win([SPINE_B, SPINE_B, SPINE_B], [10, 10, 10]);
    expect(computeForwardEnd(w, 100)).toBe(3); // all fit on the page
  });

  it('still breaks on height overflow within a document', () => {
    const w = win([SPINE_A, SPINE_A, SPINE_A, SPINE_B], [40, 40, 40, 10]);
    // Blocks 0+1 = 80 ≤ 100, adding block 2 → 120 > 100, so page ends at 2.
    expect(computeForwardEnd(w, 100)).toBe(2);
  });

  it('spine boundary wins when it occurs before overflow', () => {
    const w = win([SPINE_A, SPINE_A, SPINE_B, SPINE_B], [40, 60, 10, 10]);
    // Block 0+1 = 100 fits exactly. Block 2 is a new spine AND is pushed to a
    // new page regardless — boundary at 2.
    expect(computeForwardEnd(w, 100)).toBe(2);
  });

  it('keeps a whole single-document page together', () => {
    const w = win([SPINE_A, SPINE_A, SPINE_A], [30, 30, 30]);
    expect(computeForwardEnd(w, 100)).toBe(3); // 90 ≤ 100, no boundary
  });
});

describe('computeBackwardStart (new spine = new page)', () => {
  it('starts the visible page at a spine boundary', () => {
    // Trailing page would be spine C's two blocks; the boundary at block 2
    // means the page starts there, not earlier in spine B.
    const w = win(
      [SPINE_B, SPINE_B, SPINE_C, SPINE_C],
      [10, 10, 10, 10],
    );
    expect(computeBackwardStart(w, 100)).toBe(2);
  });

  it('overflow within a document starts the page after the tall block', () => {
    const w = win([SPINE_A, SPINE_A, SPINE_A, SPINE_B], [10, 90, 10, 10]);
    // Going backward: block 3 (10) fits, block 2 (10) fits, adding block 1
    // (90) → 110 > 100, so the visible page starts at block 2.
    expect(computeBackwardStart(w, 100)).toBe(2);
  });

  it('matches the forward boundary when the page is exactly full', () => {
    // Same layout as the "spine boundary wins" forward case: 0+1 fill 100px,
    // block 2 opens a new document → backward page starts at 2 too, so
    // forward/backward stay in sync across the chapter turn.
    const w = win([SPINE_A, SPINE_A, SPINE_B, SPINE_B], [40, 60, 10, 10]);
    expect(computeForwardEnd(w, 100)).toBe(2);
    expect(computeBackwardStart(w, 100)).toBe(2);
  });
});
