import { describe, expect, it } from 'vitest';
import { assetKeysIn, audioTracksIn, recordingsIn } from './types';
import type { Task } from './types';
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
