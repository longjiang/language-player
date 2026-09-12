import { describe, expect, it } from 'vitest';
import { assertValid, validateBook, validateTask } from './schema';
import { tbltHsk4 } from './content/tblt-hsk4/book';
import { TBLT_HSK4_ASSET_KEYS } from './content/tblt-hsk4/assets';
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
    expect(errorsOf(validateTask(t)).join()).toContain('"b2" has no matching entry');
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

  it('rejects a duplicated reference', () => {
    const t = base({ body: [{ kind: 'passage', text: '{{b1}}和{{b1}}' }] });
    expect(errorsOf(validateTask(t)).join()).toContain('Duplicate blank references');
  });

  it('accepts a blank referenced only by numberedBlanks', () => {
    const t = base({
      body: [{ kind: 'numberedBlanks', ids: ['b1'] }],
      blanks: { b1: { id: 'b1', kind: 'choose', answer: 'A', optionSet: 'ps1' } },
      answerKeyRaw: '① A。',
    });
    // The pictureSet is referenced, so the only complaint is the missing set.
    expect(errorsOf(validateTask(t)).join()).toContain('missing pictureSet');
    expect(errorsOf(validateTask(t)).join()).not.toContain('not referenced');
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

describe('asset manifest', () => {
  const issues = validateBook(tbltHsk4, { assetKeys: TBLT_HSK4_ASSET_KEYS });

  it('every asset the content references is declared in the manifest', () => {
    // This is the check that catches a mistyped audio filename or image key: a
    // content reference to an unpublished asset is a broken exercise, and it is
    // far cheaper to catch here than in front of a student.
    expect(issues.filter((i) => i.level === 'error')).toEqual([]);
  });

  it('declares no duplicate keys', () => {
    expect(new Set(TBLT_HSK4_ASSET_KEYS).size).toBe(TBLT_HSK4_ASSET_KEYS.length);
  });

  it('declares no asset that nothing references', () => {
    const referenced = new Set<string>();
    for (const task of allTasks(tbltHsk4)) {
      for (const track of task.audio ?? []) referenced.add(track.key);
      for (const stimulus of task.body) {
        if (stimulus.kind === 'pictureSet') {
          for (const item of stimulus.items) if (item.image) referenced.add(item.image);
        }
      }
    }
    const unused = TBLT_HSK4_ASSET_KEYS.filter((key) => !referenced.has(key));
    expect(unused).toEqual([]);
  });
});

describe('picture sets and shared key items', () => {
  const withSet = (over: Partial<Task> = {}): Task =>
    base({
      body: [
        {
          kind: 'pictureSet',
          id: 'ps1',
          items: [
            { letter: 'A', label: '一', image: 'x/a.png' },
            { letter: 'B', label: '二', image: 'x/b.png' },
          ],
        },
        { kind: 'numberedBlanks', ids: ['b1'] },
      ],
      blanks: { b1: { id: 'b1', kind: 'choose', answer: 'A', optionSet: 'ps1' } },
      answerKeyRaw: '① A。',
      ...over,
    });

  it('accepts a blank answered from a picture set', () => {
    expect(errorsOf(validateTask(withSet()))).toEqual([]);
  });

  it('rejects an answer that is not a letter in the set', () => {
    const t = withSet({
      blanks: { b1: { id: 'b1', kind: 'choose', answer: 'Z', optionSet: 'ps1' } },
      answerKeyRaw: '① Z。',
    });
    expect(errorsOf(validateTask(t)).join()).toContain('is not a letter in pictureSet');
  });

  it('rejects a reference to a set that does not exist', () => {
    const t = withSet({
      blanks: { b1: { id: 'b1', kind: 'choose', answer: 'A', optionSet: 'nope' } },
    });
    expect(errorsOf(validateTask(t)).join()).toContain('references missing pictureSet');
  });

  it('rejects a choose blank with neither a bank nor an option set', () => {
    const t = base({ blanks: { b1: { id: 'b1', kind: 'choose', answer: 'A' } } });
    expect(errorsOf(validateTask(t)).join()).toContain('neither a bank nor an optionSet');
  });

  it('lets two blanks share one key item (the A ➌ row shape)', () => {
    // `2. 金敏俊: B、c` gives both the "how" and the "where" answer in one item,
    // so both blanks of that row cite it.
    const t = base({
      body: [{ kind: 'passage', text: '{{b1}}{{b2}}' }],
      blanks: {
        b1: { id: 'b1', kind: 'type', answer: 'B', keyIndex: 2 },
        b2: { id: 'b2', kind: 'type', answer: 'c', keyIndex: 2 },
      },
      answerKeyRaw: '2. 金名: B、c。',
    });
    expect(errorsOf(validateTask(t))).toEqual([]);
  });

  it('still catches an answer that disagrees within a shared key item', () => {
    const t = base({
      body: [{ kind: 'passage', text: '{{b1}}{{b2}}' }],
      blanks: {
        b1: { id: 'b1', kind: 'type', answer: 'B', keyIndex: 2 },
        b2: { id: 'b2', kind: 'type', answer: 'X', keyIndex: 2 },
      },
      answerKeyRaw: '2. 金名: B、c。',
    });
    expect(errorsOf(validateTask(t)).join()).toContain('disagrees with the key');
  });

  it('warns about a picture set nothing references', () => {
    const t = base({
      body: [
        { kind: 'pictureSet', id: 'orphan', items: [{ letter: 'A', label: '一', image: 'x/a.png' }] },
      ],
    });
    const warnings = validateTask(t).filter((i) => i.level === 'warning').map((i) => i.message);
    expect(warnings.join()).toContain('never referenced by a blank');
  });
});
