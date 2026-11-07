import { describe, it, expect } from 'vitest';
import { entryDifficultyLevel, lowestEntryLevel } from './word-level';

describe('word-level: entryDifficultyLevel', () => {
  it('reads a frequency-derived level', () => {
    expect(entryDifficultyLevel({ levels: null, frequencyLevel: 2 })).toBe(2);
  });

  it('reads a canonical exam level from levels[].numeric', () => {
    expect(
      entryDifficultyLevel({
        levels: [
          { scale: 'hsk_2025', value: '1', numeric: 1 },
          { scale: 'hsk_2010', value: '2', numeric: 2 },
        ],
        frequencyLevel: null,
      }),
    ).toBe(1);
  });

  it('takes the lowest value across both sources', () => {
    expect(
      entryDifficultyLevel({
        levels: [{ scale: 'cefr', value: 'B2', numeric: 5 }],
        frequencyLevel: 3,
      }),
    ).toBe(3);
    expect(
      entryDifficultyLevel({
        levels: [{ scale: 'cefr', value: 'A2', numeric: 2 }],
        frequencyLevel: 6,
      }),
    ).toBe(2);
  });

  it('treats missing, null and out-of-range values as unclassified', () => {
    expect(entryDifficultyLevel({})).toBeNull();
    expect(entryDifficultyLevel({ levels: null, frequencyLevel: null })).toBeNull();
    expect(entryDifficultyLevel({ levels: [], frequencyLevel: 0 })).toBeNull();
    expect(entryDifficultyLevel({ levels: [], frequencyLevel: 8 })).toBeNull();
    expect(
      entryDifficultyLevel({ levels: [{ scale: 'cefr', value: 'C2', numeric: 9 }] }),
    ).toBeNull();
  });
});

describe('word-level: lowestEntryLevel', () => {
  it('returns the lowest across candidate entries', () => {
    expect(
      lowestEntryLevel([
        { levels: null, frequencyLevel: 5 },
        { levels: null, frequencyLevel: 1 },
      ]),
    ).toBe(1);
  });

  it('ignores unclassified entries and empty lists', () => {
    expect(lowestEntryLevel([])).toBeNull();
    expect(lowestEntryLevel(null)).toBeNull();
    expect(lowestEntryLevel([{ levels: null, frequencyLevel: null }])).toBeNull();
  });
});
