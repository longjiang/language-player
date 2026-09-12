import { describe, expect, it } from 'vitest';
import { assetKeysIn, audioTracksIn, recordingsIn, transcriptsIn } from './types';
import type { BookMeta, Task, TranscriptLine } from './types';
import { tbltHsk4 } from './content/tblt-hsk4/book';
import { findTask } from './loaders';

/**
 * A recording can be declared at four levels (SPEC-095 §Audio), so "the audio of
 * this task" is not `task.audio[]`. These cover the walk that both the manifest
 * check and the players read, because the two disagreeing is what left every
 * inline control in A ➋ pointing at a key nothing could resolve.
 */
const everyLevel: Task = {
  id: 'b.u1.A.t1',
  number: '➊',
  sourcePage: 1,
  instructions: '听录音',
  audio: [{ key: 'a/task.mp3', label: 'task' }],
  body: [
    {
      kind: 'pictureSet',
      id: 'ps1',
      items: [{ letter: 'A', label: '一', image: 'a/pic.png' }],
    },
    { kind: 'numberedBlanks', ids: ['b1'] },
    { kind: 'audio', tracks: [{ key: 'a/block.mp3' }] },
    { kind: 'passage', text: '说话{{b1}}。', audio: [{ key: 'a/passage.mp3' }] },
    { kind: 'dialogue', lines: [{ speaker: '甲', text: '{{b1}}' }], audio: [{ key: 'a/dialogue.mp3' }] },
    {
      kind: 'dataTable',
      columns: ['', '一'],
      rows: [{ cells: ['甲', '{{b1}}'], audio: [{ key: 'a/row.mp3' }] }],
    },
    {
      kind: 'imageMap',
      image: 'a/map.png',
      pins: [{ blankId: 'b1', x: 1, y: 2, audio: [{ key: 'a/pin.mp3' }] }],
    },
  ],
  blanks: {
    b1: { id: 'b1', kind: 'type', answer: '新', audio: [{ key: 'a/blank.mp3' }] },
  },
};

describe('recordingsIn', () => {
  it('finds a recording at every level and says where it was declared', () => {
    expect(recordingsIn(everyLevel).map((r) => r.where)).toEqual([
      'task audio',
      'blank b1',
      'audio block',
      'passage block',
      'dialogue block',
      'dataTable row 1',
      'imageMap pin b1',
    ]);
  });

  it('finds nothing in a task that declares no recording', () => {
    expect(recordingsIn({ ...everyLevel, audio: undefined, body: [], blanks: {} })).toEqual([]);
  });
});

describe('audioTracksIn', () => {
  it('returns the task’s recordings as one flat list', () => {
    expect(audioTracksIn(everyLevel).map((t) => t.key)).toEqual([
      'a/task.mp3',
      'a/blank.mp3',
      'a/block.mp3',
      'a/passage.mp3',
      'a/dialogue.mp3',
      'a/row.mp3',
      'a/pin.mp3',
    ]);
  });

  it('de-duplicates a key that more than one item replays, keeping the first label', () => {
    // A ➍ replays each of A ➌'s five recordings on its own passage block, and a key
    // is one URL: listing it twice would put two entries in the player's map.
    const replayed: Task = {
      ...everyLevel,
      audio: undefined,
      blanks: {},
      body: [
        { kind: 'passage', text: '一{{b1}}', audio: [{ key: 'a/row.mp3', label: '李婷婷' }] },
        { kind: 'passage', text: '二{{b2}}', audio: [{ key: 'a/row.mp3' }] },
      ],
    };
    expect(audioTracksIn(replayed)).toEqual([{ key: 'a/row.mp3', label: '李婷婷' }]);
  });

  it('covers every recording the pilot book’s tasks declare, and A ➋ is all per-item', () => {
    const t2 = findTask(tbltHsk4, 'tblt-hsk4.u06.A.t2')!;
    // The task that reported the defect: typed `listening`, and no `audio` of its own.
    expect(t2.audio).toBeUndefined();
    const blankKeys = Object.values(t2.blanks ?? {}).flatMap((b) => (b.audio ?? []).map((a) => a.key));
    expect(blankKeys).toHaveLength(7);
    expect(audioTracksIn(t2).map((t) => t.key)).toEqual(blankKeys);
  });
});

describe('assetKeysIn', () => {
  it('still reports every recording once, alongside the images', () => {
    // The recordings now come from `recordingsIn`; this guards the refactor that
    // joined them, since a key missed here fails validation with a false "not in the
    // manifest" error.
    const keys = assetKeysIn(everyLevel).map((r) => r.key);
    expect(keys).toContain('a/blank.mp3');
    expect(keys).toContain('a/row.mp3');
    expect(keys).toContain('a/pin.mp3');
    expect(keys).toContain('a/map.png');
    expect(keys).toContain('a/pic.png');
    expect(new Set(keys).size).toBe(keys.length);
  });
});

/**
 * A transcript belongs to the recording, not to the task that plays it, so the index
 * is keyed by asset key and built from the whole book (SPEC-095 §Transcript).
 */
describe('transcriptsIn', () => {
  const book = (tasks: Task[]): BookMeta => ({
    id: 'b',
    title: 'B',
    l2: 'zh',
    contentVersion: 1,
    units: [{ id: 'u1', number: 6, title: 'U1', lessons: [{ id: 'A', letter: 'A', title: 'A', tasks }] }],
  });

  const withTranscript = (taskId: string, key: string, transcript: TranscriptLine[]): Task => ({
    id: taskId,
    number: '➊',
    sourcePage: 1,
    instructions: '听录音',
    audio: [{ key, transcript }],
    body: [{ kind: 'audio', tracks: [{ key }] }],
    blanks: {},
  });

  it('finds a recording’s transcript from a task that only replays it', () => {
    // A ➍ replays A ➌'s files; the text is declared once, under A ➌.
    const replay: Task = {
      id: 'b.u1.A.t2',
      number: '➋',
      sourcePage: 2,
      instructions: '再听一遍',
      body: [{ kind: 'passage', text: '文字', audio: [{ key: 'a/one.mp3' }] }],
      blanks: {},
    };
    const map = transcriptsIn(
      book([withTranscript('b.u1.A.t1', 'a/one.mp3', [{ speaker: '男', text: '西安是我的老家。' }]), replay]),
    );
    expect(map.get('a/one.mp3')).toEqual([{ speaker: '男', text: '西安是我的老家。' }]);
  });

  it('ignores a recording that has no transcript, so its control offers none', () => {
    const map = transcriptsIn(book([withTranscript('b.u1.A.t1', 'a/one.mp3', [])]));
    expect(map.has('a/one.mp3')).toBe(false);
  });

  it('keeps a transcript declared on any of the four levels', () => {
    const onBlank: Task = {
      id: 'b.u1.A.t1',
      number: '➊',
      sourcePage: 1,
      instructions: '听',
      body: [{ kind: 'numberedBlanks', ids: ['b1'] }],
      blanks: { b1: { id: 'b1', kind: 'type', answer: 'x', audio: [{ key: 'a/b.mp3', transcript: [{ text: '第一' }] }] } },
    };
    const onRow: Task = {
      ...onBlank,
      body: [{ kind: 'dataTable', columns: ['a'], rows: [{ cells: ['x'], audio: [{ key: 'a/r.mp3', transcript: [{ text: '第二' }] }] }] }],
      blanks: {},
    };
    const map = transcriptsIn(book([onBlank, onRow]));
    expect(map.get('a/b.mp3')).toEqual([{ text: '第一' }]);
    expect(map.get('a/r.mp3')).toEqual([{ text: '第二' }]);
  });
});

/**
 * A ➍'s summaries print no question numerals.
 *
 * The workbook numbers each summary's blanks ①–④, but the answer key is addressed by
 * `keyLabel` (`2.1`, `3.1`, …) because the numerals restart in every item — so printing them
 * told the student nothing about which answer the key expected, and the blanks are visible
 * where they are. The numerals were noise in the middle of the sentence being read.
 */
describe('A ➍’s passages', () => {
  it('carry no circled numerals, only their blanks', () => {
    const t = findTask(tbltHsk4, 'tblt-hsk4.u06.A.t4')!;
    for (const stimulus of t.body) {
      if (stimulus.kind !== 'passage') continue;
      expect(stimulus.text).not.toMatch(/[①②③④⑤⑥⑦⑧⑨]/);
    }
    // The blanks themselves are all still there, and still addressed by label.
    const marked = t.body.flatMap((s) => (s.kind === 'passage' ? [s.text] : [])).join('');
    expect(marked.match(/\{\{b\d+\}\}/g)).toHaveLength(17);
  });
});
