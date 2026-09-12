import { describe, expect, it } from 'vitest';
import { answersForKeyIndex, circledToIndex, indexToCircled, parseAnswerKey } from './answer-key';

describe('circled numerals', () => {
  it('maps a numeral to its 1-based index', () => {
    expect(circledToIndex('①')).toBe(1);
    expect(circledToIndex('②')).toBe(2);
    expect(circledToIndex('⑩')).toBe(10);
    expect(circledToIndex('新')).toBeNull();
  });

  it('round-trips', () => {
    for (const index of [1, 2, 5, 9, 20]) {
      expect(circledToIndex(indexToCircled(index))).toBe(index);
    }
  });
});

describe('parseAnswerKey', () => {
  it('parses a single-answer line', () => {
    expect(parseAnswerKey('② 新; ③ 免费Wi-Fi; ④ 充电口。')).toEqual([
      { index: 2, answers: ['新'] },
      { index: 3, answers: ['免费Wi-Fi'] },
      { index: 4, answers: ['充电口'] },
    ]);
  });

  it('parses the letter answers of a letter-bank task', () => {
    expect(parseAnswerKey('③ f; ④ c; ⑤ a; ⑥ d.')).toEqual([
      { index: 3, answers: ['f'] },
      { index: 4, answers: ['c'] },
      { index: 5, answers: ['a'] },
      { index: 6, answers: ['d'] },
    ]);
  });

  it('keeps multiple answers for one item as a set', () => {
    expect(parseAnswerKey('③ G875、G49、D17、D11; ④ Z281。')).toEqual([
      { index: 3, answers: ['G875', 'G49', 'D17', 'D11'] },
      { index: 4, answers: ['Z281'] },
    ]);
  });

  it('records the gap left by a worked example', () => {
    // B ➊ prints ① a and ② b, so the key starts at ③. The absence is the
    // signal that ① and ② are `given`, not that the key is incomplete.
    const items = parseAnswerKey('③ f; ④ c; ⑤ a; ⑥ d.');
    expect(items.map((i) => i.index)).toEqual([3, 4, 5, 6]);
    expect(answersForKeyIndex('③ f; ④ c; ⑤ a; ⑥ d.', 1)).toEqual([]);
  });

  it('handles full-width separators and trailing punctuation', () => {
    expect(parseAnswerKey('① 北京：C；② 成都：D。')).toEqual([
      { index: 1, answers: ['北京：C'] },
      { index: 2, answers: ['成都：D'] },
    ]);
  });

  it('is empty-safe', () => {
    expect(parseAnswerKey('')).toEqual([]);
  });
});
