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

  it('handles full-width separators and drops a row label before the answers', () => {
    // `北京：C` means "the Beijing blank is C": the label names the blank and the
    // value after the colon is the answer. Keeping the label would make the
    // answer unmatchable, so it is stripped. This replaced an earlier behaviour
    // that kept it — nothing consumed that shape, and the labelled-row form the
    // real key uses (A ➌, D ➋) needs it stripped.
    expect(parseAnswerKey('① 北京：C；② 成都：D。')).toEqual([
      { index: 1, answers: ['C'] },
      { index: 2, answers: ['D'] },
    ]);
  });

  it('is empty-safe', () => {
    expect(parseAnswerKey('')).toEqual([]);
  });
});

describe('parseAnswerKey — row-number and label forms', () => {
  it('parses `N.` row numbers with a name label (A ➌)', () => {
    expect(parseAnswerKey('2. 金敏俊: B、c; 3. 奥利维亚: D, a; 4. 陈灵: C, d; 5. 朴书妍: A, e。')).toEqual([
      { index: 2, answers: ['B', 'c'] },
      { index: 3, answers: ['D', 'a'] },
      { index: 4, answers: ['C', 'd'] },
      { index: 5, answers: ['A', 'e'] },
    ]);
  });

  it('parses bracketed answers on labelled rows (D ➋)', () => {
    const raw = '(4) 运营时刻 ......... [ C ]\n(3) 站台 ......... [ E ]\n(5) 其它需要注意的 ......... [ B ]';
    expect(parseAnswerKey(raw)).toEqual([
      { index: 4, answers: ['C'] },
      { index: 3, answers: ['E'] },
      { index: 5, answers: ['B'] },
    ]);
  });

  it('still parses circled numerals without labels', () => {
    expect(parseAnswerKey('③ f; ④ c; ⑤ e; ⑥ d。')).toEqual([
      { index: 3, answers: ['f'] },
      { index: 4, answers: ['c'] },
      { index: 5, answers: ['e'] },
      { index: 6, answers: ['d'] },
    ]);
  });

  it('does not mistake a decimal or a range for a row number', () => {
    // `2点56` and `503` are answer text, not indices.
    expect(parseAnswerKey('② 2点56; ③ 503。')).toEqual([
      { index: 2, answers: ['2点56'] },
      { index: 3, answers: ['503'] },
    ]);
  });
});
