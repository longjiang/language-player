import { describe, expect, it } from 'vitest';
import { assertValid, validateBook, validateTask } from './schema';
import { tbltHsk4 } from './content/tblt-hsk4/book';
import { allTasks } from './loaders';
import type { Task } from './types';

const base = (over: Partial<Task> = {}): Task => ({
  id: 'tblt-hsk4.u06.B.t9',
  number: '➒',
  sourcePage: 1,
  instructions: '填词',
  body: [{ kind: 'passage', text: '比较{{b1}}。' }],
  blanks: { b1: { id: 'b1', kind: 'type', answer: '新' } },
  ...over,
});

const errorsOf = (issues: ReturnType<typeof validateTask>) =>
  issues.filter((i) => i.level === 'error').map((i) => i.message);

describe('validateTask', () => {
  it('accepts a well-formed task', () => {
    expect(errorsOf(validateTask(base()))).toEqual([]);
  });

  it('rejects a blank with no answer', () => {
    const t = base({ blanks: { b1: { id: 'b1', kind: 'type', answer: '' } } });
    expect(errorsOf(validateTask(t)).join()).toContain('has no answer');
  });

  it('rejects a marker with no matching blank', () => {
    const t = base({ body: [{ kind: 'passage', text: '比较{{b1}}，也{{b2}}。' }] });
    expect(errorsOf(validateTask(t)).join()).toContain('{{b2}} has no matching entry');
  });

  it('rejects a blank no marker references', () => {
    const t = base({
      blanks: {
        b1: { id: 'b1', kind: 'type', answer: '新' },
        b2: { id: 'b2', kind: 'type', answer: '快' },
      },
    });
    expect(errorsOf(validateTask(t)).join()).toContain('is not referenced by any');
  });

  it('rejects a duplicated marker', () => {
    const t = base({ body: [{ kind: 'passage', text: '{{b1}}和{{b1}}' }] });
    expect(errorsOf(validateTask(t)).join()).toContain('Duplicate blank markers');
  });

  it('rejects a choose blank pointing at a missing bank', () => {
    const t = base({ blanks: { b1: { id: 'b1', kind: 'choose', answer: '新', bank: 'nope' } } });
    expect(errorsOf(validateTask(t)).join()).toContain('references missing bank');
  });

  it('rejects a choose answer that is not in its bank', () => {
    const t = base({
      blanks: { b1: { id: 'b1', kind: 'choose', answer: '快', bank: 'w1' } },
      banks: [{ id: 'w1', items: ['新', '旧'] }],
    });
    expect(errorsOf(validateTask(t)).join()).toContain('is not in bank');
  });

  it('rejects an answer that disagrees with the printed key', () => {
    const t = base({ answerKeyRaw: '① 快。' });
    expect(errorsOf(validateTask(t)).join()).toContain('disagrees with the key');
  });

  it('rejects a blank missing from the key', () => {
    const t = base({ answerKeyRaw: '② 快。' });
    expect(errorsOf(validateTask(t)).join()).toContain('absent from the answer key');
  });

  it('does not require a key entry for a given blank', () => {
    const t = base({
      body: [{ kind: 'passage', text: '{{b1}}{{b2}}' }],
      blanks: {
        b1: { id: 'b1', kind: 'given', answer: '快' },
        b2: { id: 'b2', kind: 'type', answer: '新' },
      },
      answerKeyRaw: '② 新。',
    });
    expect(errorsOf(validateTask(t))).toEqual([]);
  });

  it('flags a missing audio asset when a manifest is supplied', () => {
    const t = base({ audio: [{ key: 'u06/B/t2.mp3' }] });
    const issues = validateTask(t, { assetKeys: new Set(['other.mp3']) });
    expect(errorsOf(issues).join()).toContain('not in the asset manifest');
  });

  it('warns rather than errors on soft problems', () => {
    const t = base({ sourcePage: undefined, type: 'listening' });
    const warnings = validateTask(t).filter((i) => i.level === 'warning').map((i) => i.message);
    expect(warnings.join()).toContain('no sourcePage');
    expect(warnings.join()).toContain('no audio');
  });

  it('requires instructions', () => {
    expect(errorsOf(validateTask(base({ instructions: '' }))).join()).toContain('no instructions');
  });
});

describe('the shipped book', () => {
  const issues = validateBook(tbltHsk4);

  it('has no validation errors', () => {
    expect(issues.filter((i) => i.level === 'error')).toEqual([]);
  });

  it('passes assertValid', () => {
    expect(() => assertValid(issues, 'tblt-hsk4')).not.toThrow();
  });

  it('every task has a unique id and a parseable unit prefix', () => {
    const ids = allTasks(tbltHsk4).map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const task of allTasks(tbltHsk4)) {
      expect(task.id.startsWith('tblt-hsk4.u06.')).toBe(true);
    }
  });

  it('every task declares at least one stimulus', () => {
    for (const task of allTasks(tbltHsk4)) {
      expect(task.body.length).toBeGreaterThan(0);
    }
  });
});
