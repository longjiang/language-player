import { describe, expect, it } from 'vitest';
import {
  acceptedAnswers,
  expandAcceptedVariants,
  gradeTask,
  isBlankCorrect,
  isBlankScoreable,
  normalizeAnswer,
} from './grading';
import type { BlankSpec, Task } from './types';

const blank = (over: Partial<BlankSpec> = {}): BlankSpec => ({
  id: 'b1',
  kind: 'type',
  answer: '充电口',
  ...over,
});

const task = (over: Partial<Task> = {}): Task => ({
  id: 'tblt-hsk4.u06.B.t2',
  number: '➋',
  instructions: '填词',
  body: [{ kind: 'passage', text: '比较{{b1}}' }],
  blanks: { b1: blank() },
  ...over,
});

describe('normalizeAnswer', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeAnswer('  充电口  ')).toBe('充电口');
    expect(normalizeAnswer('免费  Wi-Fi')).toBe('免费 Wi-Fi');
  });

  it('unifies full-width ASCII and ideographic space', () => {
    expect(normalizeAnswer('Ｗｉ－Ｆｉ')).toBe('Wi-Fi');
    expect(normalizeAnswer('1\u30002')).toBe('1 2');
  });

  it('strips edge punctuation but keeps it inside a word', () => {
    expect(normalizeAnswer('新。')).toBe('新');
    expect(normalizeAnswer('「新」')).toBe('新');
    expect(normalizeAnswer('免费Wi-Fi')).toBe('免费Wi-Fi');
    expect(normalizeAnswer('1,275')).toBe('1,275');
  });

  it('removes zero-width characters left by IMEs', () => {
    expect(normalizeAnswer('充\u200b电口')).toBe('充电口');
  });

  it('is empty-safe', () => {
    expect(normalizeAnswer('')).toBe('');
    expect(normalizeAnswer('   ')).toBe('');
  });
});

describe('isBlankCorrect', () => {
  it('matches the answer exactly after normalisation', () => {
    expect(isBlankCorrect(blank(), '充电口')).toBe(true);
    expect(isBlankCorrect(blank(), ' 充电口 ')).toBe(true);
    expect(isBlankCorrect(blank(), '充电')).toBe(false);
  });

  it('rejects an empty answer', () => {
    expect(isBlankCorrect(blank(), '')).toBe(false);
    expect(isBlankCorrect(blank(), undefined as unknown as string)).toBe(false);
  });

  it('accepts every listed alternate', () => {
    const b = blank({ answer: '免费Wi-Fi', accept: ['免费WiFi', '免费 Wi-Fi'] });
    expect(isBlankCorrect(b, '免费WiFi')).toBe(true);
    expect(isBlankCorrect(b, '免费 Wi-Fi')).toBe(true);
    expect(isBlankCorrect(b, 'wifi')).toBe(false);
  });

  it('treats a given blank as always correct', () => {
    expect(isBlankCorrect(blank({ kind: 'given', answer: '快' }), '')).toBe(true);
  });

  it('deduplicates accepted answers', () => {
    expect(acceptedAnswers(blank({ answer: '新', accept: ['新 ', ' 新'] }))).toEqual(['新']);
  });
});

describe('gradeTask', () => {
  const t = task({
    blanks: {
      b1: { id: 'b1', kind: 'given', answer: '快' },
      b2: { id: 'b2', kind: 'choose', answer: '新', bank: 'w1' },
      b3: { id: 'b3', kind: 'choose', answer: '免费Wi-Fi', bank: 'w1' },
    },
  });

  it('excludes given blanks from the score', () => {
    const result = gradeTask(t, { b2: '新', b3: '免费Wi-Fi' });
    expect(result.scoreableCount).toBe(2);
    expect(result.correctCount).toBe(2);
    expect(result.complete).toBe(true);
  });

  it('reports per-blank correctness and the expected answer', () => {
    const result = gradeTask(t, { b2: '新', b3: '充电口' });
    expect(result.blanks).toEqual([
      { blankId: 'b1', correct: true, answer: '快' },
      { blankId: 'b2', correct: true, answer: '新' },
      { blankId: 'b3', correct: false, answer: '免费Wi-Fi' },
    ]);
    expect(result.complete).toBe(false);
  });

  it('accepts responses as an array or a record', () => {
    const fromArray = gradeTask(t, [
      { blankId: 'b2', value: '新' },
      { blankId: 'b3', value: '免费Wi-Fi' },
    ]);
    expect(fromArray.complete).toBe(true);
  });

  it('counts unanswered blanks as incorrect rather than skipping them', () => {
    const result = gradeTask(t, { b2: '新' });
    expect(result.scoreableCount).toBe(2);
    expect(result.correctCount).toBe(1);
    expect(result.complete).toBe(false);
  });

  it('is never "complete" when there is nothing scoreable', () => {
    const givenOnly = task({ blanks: { b1: { id: 'b1', kind: 'given', answer: '快' } } });
    const result = gradeTask(givenOnly, {});
    expect(result.scoreableCount).toBe(0);
    expect(result.complete).toBe(false);
  });
});

describe('expandAcceptedVariants', () => {
  it('folds a script variant into accept[]', () => {
    const t = task({ blanks: { b1: blank({ answer: '车' }) } });
    const expanded = expandAcceptedVariants(t, () => '車') as Task;
    expect(isBlankCorrect(expanded.blanks!.b1!, '車')).toBe(true);
    expect(isBlankCorrect(expanded.blanks!.b1!, '车')).toBe(true);
  });

  it('adds nothing when the converter returns the answer unchanged', () => {
    const t = task();
    const expanded = expandAcceptedVariants(t, (a) => a) as Task;
    expect(expanded.blanks!.b1!.accept).toBeUndefined();
  });

  it('supports an async converter', async () => {
    const t = task({ blanks: { b1: blank({ answer: '车' }) } });
    const expanded = await expandAcceptedVariants(t, async () => '車');
    expect(isBlankCorrect(expanded.blanks!.b1!, '車')).toBe(true);
  });
});

describe('ungraded blanks', () => {
  const t = task({
    blanks: {
      b1: { id: 'b1', kind: 'given', answer: '快' },
      b2: { id: 'b2', kind: 'type', answer: '新' },
      b3: { id: 'b3', kind: 'free', answer: '' },
    },
  });

  it('reports free text as unscoreable', () => {
    expect(isBlankScoreable({ id: 'b3', kind: 'free', answer: '' })).toBe(false);
    expect(isBlankScoreable({ id: 'b2', kind: 'type', answer: '新' })).toBe(true);
  });

  it('never counts free text toward the score', () => {
    const result = gradeTask(t, { b2: '新', b3: '我写了一些笔记' });
    expect(result.scoreableCount).toBe(1);
    expect(result.correctCount).toBe(1);
    expect(result.complete).toBe(true);
  });

  it('treats written free text as satisfied, and empty as not', () => {
    expect(isBlankCorrect({ id: 'b3', kind: 'free', answer: '' }, '笔记')).toBe(true);
    expect(isBlankCorrect({ id: 'b3', kind: 'free', answer: '' }, '   ')).toBe(false);
    expect(isBlankCorrect({ id: 'b3', kind: 'free', answer: '' }, '')).toBe(false);
  });

  it('cannot complete a task that is only free writing', () => {
    // There is nothing scoreable, so there is nothing to be right about.
    const freeOnly = task({ blanks: { b1: { id: 'b1', kind: 'free', answer: '' } } });
    const result = gradeTask(freeOnly, { b1: '一段话' });
    expect(result.scoreableCount).toBe(0);
    expect(result.complete).toBe(false);
  });
});

describe('multi-select blanks (B ➌)', () => {
  const multi = (over: Partial<BlankSpec> = {}): BlankSpec => ({
    id: 'b3',
    kind: 'choose',
    answer: '硬卧、软卧',
    bank: 'seats',
    multiple: true,
    ...over,
  });

  it('accepts the picks in any order', () => {
    // The student may tap 软卧 first; the set is what matters, not the sequence.
    expect(isBlankCorrect(multi(), '硬卧、软卧')).toBe(true);
    expect(isBlankCorrect(multi(), '软卧、硬卧')).toBe(true);
  });

  it('accepts a comma instead of the ideographic comma', () => {
    expect(isBlankCorrect(multi(), '硬卧,软卧')).toBe(true);
  });

  it('rejects a partial pick', () => {
    expect(isBlankCorrect(multi(), '硬卧')).toBe(false);
  });

  it('rejects a wrong pick alongside a right one', () => {
    expect(isBlankCorrect(multi(), '硬卧、硬座')).toBe(false);
  });

  it('rejects an extra pick', () => {
    expect(isBlankCorrect(multi(), '硬卧、软卧、硬座')).toBe(false);
  });

  it('still compares single blanks as whole strings', () => {
    const single: BlankSpec = { id: 'b2', kind: 'choose', answer: '商务座', bank: 'seats' };
    expect(isBlankCorrect(single, '商务座')).toBe(true);
    expect(isBlankCorrect(single, '商务座、一等座')).toBe(false);
  });
});
