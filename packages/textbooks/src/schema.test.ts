import { describe, expect, it } from 'vitest';
import { assertValid, validateBook, validateTask } from './schema';
import { tbltHsk4 } from './content/tblt-hsk4/book';
import { TBLT_HSK4_ASSET_KEYS } from './content/tblt-hsk4/assets';
import { allTasks } from './loaders';
import { assetKeysIn, BookMeta } from './types';
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

  it('rejects an imageMap pin outside the image', () => {
    // The control would be clipped by the frame's overflow-hidden, leaving a blank the
    // student can never reach — and the task still renders, so nothing else reports it.
    const t = base({
      body: [{ kind: 'imageMap', id: 'm', image: 'tblt-hsk4/u06/a1-map.png', pins: [{ blankId: 'b1', x: 104, y: 12 }] }],
      blanks: { b1: { id: 'b1', kind: 'choose', answer: 'B', optionSet: 'ps1' } },
      answerKeyRaw: '① B。',
    });
    expect(errorsOf(validateTask(t)).join()).toContain('outside the image');
  });

  it('accepts an imageMap pin inside the image', () => {
    const t = base({
      body: [{ kind: 'imageMap', id: 'm', image: 'tblt-hsk4/u06/a1-map.png', pins: [{ blankId: 'b1', x: 32.5, y: 8.26 }] }],
      blanks: { b1: { id: 'b1', kind: 'choose', answer: 'B', optionSet: 'ps1' } },
      answerKeyRaw: '① B。',
    });
    expect(errorsOf(validateTask(t)).join()).not.toContain('outside the image');
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
    // Uses the same walk as the validator, so a new declaration point cannot make
    // the two disagree.
    const referenced = new Set<string>();
    for (const task of allTasks(tbltHsk4)) {
      for (const ref of assetKeysIn(task)) referenced.add(ref.key);
    }
    // The manifest lists what tasks need; files staged for tasks not yet authored
    // are declared separately and deliberately not required to be referenced.
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

describe('mock app goals', () => {
  const app = (over: Partial<Task> = {}): Task =>
    base({
      body: [
        {
          kind: 'mockApp',
          app: 'railway-12306',
          fallbackImage: 'x/fallback.png',
          goals: [
            { id: 'fastest', blankId: 'b1' },
            { id: 'cheapest', blankId: 'b2' },
          ],
        },
      ],
      blanks: {
        b1: { id: 'b1', kind: 'goal', answer: 'G49' },
        b2: { id: 'b2', kind: 'goal', answer: 'K1275' },
      },
      answerKeyRaw: '① G49; ② K1275。',
      ...over,
    });

  it('accepts goals linked to goal blanks', () => {
    expect(errorsOf(validateTask(app()))).toEqual([]);
  });

  it('rejects a goal linking a blank that is not a goal blank', () => {
    const t = app({
      blanks: {
        b1: { id: 'b1', kind: 'goal', answer: 'G49' },
        b2: { id: 'b2', kind: 'type', answer: 'K1275' },
      },
    });
    expect(errorsOf(validateTask(t)).join()).toContain('must reference a goal or given blank');
  });

  it('allows a goal to link a worked example, which is demonstrated not scored', () => {
    // The 12306 app naturally answers all six questions, but ① is pre-filled in
    // the workbook — `given` already means exactly that.
    const t = app({
      blanks: {
        b1: { id: 'b1', kind: 'given', answer: 'G49' },
        b2: { id: 'b2', kind: 'goal', answer: 'K1275' },
      },
    });
    expect(errorsOf(validateTask(t))).toEqual([]);
  });

  it('rejects a goal blank nothing links', () => {
    const t = app({
      body: [{ kind: 'mockApp', app: 'x', goals: [{ id: 'a', blankId: 'b1' }] }],
    });
    expect(errorsOf(validateTask(t)).join()).toContain('is not linked from any mockApp goal');
  });

  it('rejects a duplicate goal id', () => {
    const t = app({
      body: [
        {
          kind: 'mockApp',
          app: 'x',
          goals: [
            { id: 'a', blankId: 'b1' },
            { id: 'a', blankId: 'b2' },
          ],
        },
      ],
    });
    expect(errorsOf(validateTask(t)).join()).toContain('declares goal "a" twice');
  });

  it('rejects a goal blank that draws from a bank', () => {
    const t = app({
      blanks: {
        b1: { id: 'b1', kind: 'goal', answer: 'G49', bank: 'w1' },
        b2: { id: 'b2', kind: 'goal', answer: 'K1275' },
      },
      banks: [{ id: 'w1', items: ['G49'] }],
    });
    expect(errorsOf(validateTask(t)).join()).toContain('cannot draw from a bank');
  });

  it('checks every accepted answer against the key, not only the primary one', () => {
    // A goal satisfied by any of several trains must not accept a train the
    // printed key does not list.
    const t = app({
      blanks: {
        b1: { id: 'b1', kind: 'goal', answer: 'G49', accept: ['G999'] },
        b2: { id: 'b2', kind: 'goal', answer: 'K1275' },
      },
    });
    expect(errorsOf(validateTask(t)).join()).toContain('"G999" disagrees with the key');
  });
});

describe('ungraded and dictation stimuli', () => {
  it('accepts a free blank with no answer key entry', () => {
    const t = base({
      body: [{ kind: 'freeWrite', blankId: 'b1' }],
      blanks: { b1: { id: 'b1', kind: 'free', answer: '' } },
      answerKeyRaw: '',
    });
    // Free text has no answer to require, so nothing should complain.
    expect(errorsOf(validateTask(t))).toEqual([]);
  });

  it('accepts a dictation stimulus whose ids reference type blanks', () => {
    const t = base({
      body: [{ kind: 'dictation', ids: ['b1'] }],
      blanks: { b1: { id: 'b1', kind: 'type', answer: '我需要在北京转机', expectedLength: 8 } },
      answerKeyRaw: '① 我需要在北京转机。',
    });
    expect(errorsOf(validateTask(t))).toEqual([]);
  });

  it('accepts note cards', () => {
    const t = base({
      body: [{ kind: 'noteCards', cards: [{ blankId: 'b1', title: '路线' }] }],
      blanks: { b1: { id: 'b1', kind: 'free', answer: '' } },
      answerKeyRaw: '',
    });
    expect(errorsOf(validateTask(t))).toEqual([]);
  });
});

describe('item audio', () => {
  const withAudio = (over: Partial<Task>) =>
    base({ audio: [{ key: 'tblt-hsk4/u06/row.mp3' }], ...over });

  it('accepts a recording declared on a blank that is its own item', () => {
    // A numbered slot (or a dictation item) is one blank, so the blank is the item.
    const t = base({
      audio: undefined,
      body: [{ kind: 'numberedBlanks', ids: ['b1'] }],
      blanks: { b1: { id: 'b1', kind: 'type', answer: '新', audio: [{ key: 'a.mp3' }] } },
    });
    expect(errorsOf(validateTask(t, { assetKeys: ['a.mp3'] }))).toEqual([]);
  });

  it('rejects a recording on a blank that lives in a passage', () => {
    // The block owns the recording there; a per-blank control has nowhere to sit.
    const t = withAudio({
      audio: undefined,
      blanks: { b1: { id: 'b1', kind: 'type', answer: '新', audio: [{ key: 'a.mp3' }] } },
    });
    expect(errorsOf(validateTask(t)).join()).toContain('the block owns the recording');
  });

  it('rejects a recording on a blank inside a dialogue line', () => {
    const t = base({
      body: [{ kind: 'dialogue', lines: [{ speaker: '甲', text: '{{b1}}' }] }],
      blanks: { b1: { id: 'b1', kind: 'type', answer: '新', audio: [{ key: 'a.mp3' }] } },
    });
    expect(errorsOf(validateTask(t)).join()).toContain('the block owns the recording');
  });

  it('checks a recording declared on a table row against the manifest', () => {
    const t = base({
      audio: undefined,
      body: [{ kind: 'dataTable', columns: ['a'], rows: [{ cells: ['{{b1}}'], audio: [{ key: 'x.mp3' }] }] }],
    });
    expect(errorsOf(validateTask(t, { assetKeys: ['other.mp3'] })).join()).toContain('dataTable row 1');
  });

  it('checks a recording declared on an audio block against the manifest', () => {
    const t = base({ audio: undefined, body: [{ kind: 'audio', tracks: [{ key: 'x.mp3' }] }] });
    expect(errorsOf(validateTask(t, { assetKeys: ['other.mp3'] })).join()).toContain('audio block');
  });

  it('checks a recording declared on a passage block against the manifest', () => {
    const t = base({
      audio: undefined,
      body: [{ kind: 'passage', text: '{{b1}}', audio: [{ key: 'x.mp3' }] }],
    });
    expect(errorsOf(validateTask(t, { assetKeys: ['other.mp3'] })).join()).toContain('passage block');
  });
});

describe('authored item audio', () => {
  it('binds the item-per-recording tasks and leaves A ➊ task-level', () => {
    const byId = new Map(allTasks(tbltHsk4).map((t) => [t.id, t]));
    // A ➌: five speakers, each recording on their row.
    const a3 = byId.get('tblt-hsk4.u06.A.t3')!;
    const table = a3.body.find((b) => b.kind === 'dataTable') as { rows: { audio?: unknown[] }[] };
    expect(table.rows.length).toBe(5);
    expect(table.rows.every((r) => (r.audio?.length ?? 0) === 1)).toBe(true);
    // A ➊: nine tracks on the task, none on an item.
    const a1 = byId.get('tblt-hsk4.u06.A.t1')!;
    expect(a1.audio?.length).toBe(9);
    expect(a1.body.some((b) => 'audio' in b && b.audio)).toBe(false);
  });

  it('moves A ➋ and the dictation recordings onto their blanks', () => {
    const byId = new Map(allTasks(tbltHsk4).map((t) => [t.id, t]));
    const a2 = byId.get('tblt-hsk4.u06.A.t2')!;
    expect(a2.audio).toBeUndefined();
    const keyed = Object.values(a2.blanks!).filter((b) => b.audio?.length);
    expect(keyed.map((b) => b.id)).toEqual(['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7']);
  });
});

describe('recall stimuli (D ➐)', () => {
  const book = (taskId: string): BookMeta =>
    ({
      id: 'tblt-hsk4',
      unit: undefined,
      units: [
        {
          id: 'u06',
          lessons: [
            {
              id: 'D',
              letter: 'D',
              title: 't',
              canDo: 'c',
              tasks: [
                base({ id: 'tblt-hsk4.u06.D.t6' }),
                base({
                  id: 'tblt-hsk4.u06.D.t7',
                  number: '➐',
                  body: [{ kind: 'recall', taskId, items: [{ blankId: 'b1', title: '路线' }] }],
                }),
              ],
            },
          ],
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ],
    }) as any;

  it('accepts a recall that names a task in the same book', () => {
    const issues = validateBook(book('tblt-hsk4.u06.D.t6'));
    expect(issues.filter((i) => i.message.includes('Recall stimulus'))).toEqual([]);
  });

  it('rejects a recall pointing at a task that does not exist', () => {
    // A wrong id renders nothing at all, silently, which is worth catching here.
    const issues = validateBook(book('tblt-hsk4.u06.D.t9'));
    expect(issues.some((i) => i.message.includes('Recall stimulus points at'))).toBe(true);
  });
});

describe('transcripts', () => {
  const withTranscript = (transcript: { speaker?: string; text: string }[]) =>
    base({
      audio: [{ key: 'a/one.mp3', transcript }],
      blanks: {},
      body: [{ kind: 'audio', tracks: [{ key: 'a/one.mp3' }] }],
    });

  it('accepts a transcript on a recording', () => {
    const issues = validateTask(
      withTranscript([{ speaker: '男', text: '西安是我的老家。' }, { text: '然后是正文。' }]),
      { assetKeys: new Set(['a/one.mp3']) },
    );
    expect(errorsOf(issues)).toEqual([]);
  });

  it('rejects a blank marker inside a transcript', () => {
    // The dialog renders read-only text, so a marker there is a blank nothing renders —
    // and the recording does not have a hole in it where the student hears a word.
    const issues = validateTask(withTranscript([{ text: '下了飞机以后{{b1}}，' }]));
    expect(errorsOf(issues).join()).toContain('A transcript is read-only text');
  });

  it('rejects an empty transcript line', () => {
    const issues = validateTask(withTranscript([{ speaker: '男', text: '   ' }]));
    expect(errorsOf(issues).join()).toContain('is empty');
  });

  it('rejects one recording carrying two different transcripts across the book', () => {
    // The index is keyed by recording, so the second declaration would be ignored —
    // silently showing one task's text for another's recording.
    const one = base({
      id: 'tblt-hsk4.u06.D.t2',
      audio: [{ key: 'a/shared.mp3', transcript: [{ text: '第一版' }] }],
      blanks: {},
      body: [{ kind: 'audio', tracks: [{ key: 'a/shared.mp3' }] }],
    });
    const two = { ...one, id: 'tblt-hsk4.u06.D.t3', audio: [{ key: 'a/shared.mp3', transcript: [{ text: '第二版' }] }] };
    const bookMeta: BookMeta = {
      id: 'tblt-hsk4',
      title: 'T',
      l2: 'zh',
      contentVersion: 1,
      units: [{ id: 'u06', number: 6, title: 'U6', lessons: [{ id: 'D', letter: 'D', title: 'D', tasks: [one, two] }] }],
    };
    const issues = validateBook(bookMeta);
    expect(issues.some((i) => i.message.includes('two different transcripts'))).toBe(true);
  });

  it('accepts the same transcript declared twice for one recording', () => {
    const one = base({
      id: 'tblt-hsk4.u06.D.t2',
      audio: [{ key: 'a/shared.mp3', transcript: [{ text: '同一版' }] }],
      blanks: {},
      body: [{ kind: 'audio', tracks: [{ key: 'a/shared.mp3' }] }],
    });
    const two = { ...one, id: 'tblt-hsk4.u06.D.t3' };
    const bookMeta: BookMeta = {
      id: 'tblt-hsk4',
      title: 'T',
      l2: 'zh',
      contentVersion: 1,
      units: [{ id: 'u06', number: 6, title: 'U6', lessons: [{ id: 'D', letter: 'D', title: 'D', tasks: [one, two] }] }],
    };
    expect(validateBook(bookMeta).filter((i) => i.message.includes('two different transcripts'))).toEqual([]);
  });
});
