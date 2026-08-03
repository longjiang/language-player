/**
 * Tests for saved words data transformations.
 * Verifies local/cloud merge logic, JSON serialization, and edge cases.
 */
import { describe, it, expect } from 'vitest';
import type { SavedLexicalItemStore, SavedLexicalItemRecord } from '@langplayer/shared';
import { enqueuePendingOp, reducePendingOps, flushPendingOps, type PendingSavedWordOp } from '@langplayer/utils';
import {
  mergeSavedWords,
  collectMissingLocalWords,
} from './use-saved-words';

function makeWord(id: string, l2: string, date: number): SavedLexicalItemRecord {
  return {
    id,
    forms: [id],
    date,
    context: { form: id, text: `Example sentence with ${id}` },
  };
}

describe('mergeSavedWords', () => {
  it('adds cloud words not present locally', () => {
    const local: SavedLexicalItemStore = {
      zh: [makeWord('cedict-1', 'zh', 100)],
    };
    const cloud: SavedLexicalItemStore = {
      zh: [makeWord('cedict-1', 'zh', 50), makeWord('cedict-2', 'zh', 200)],
    };

    const merged = mergeSavedWords(local, cloud);
    expect(merged['zh']).toHaveLength(2);
    expect(merged['zh']!.map(w => w.id).sort()).toEqual(['cedict-1', 'cedict-2']);
  });

  it('does not duplicate words already present locally', () => {
    const local: SavedLexicalItemStore = {
      ja: [makeWord('edict-1', 'ja', 100)],
    };
    const cloud: SavedLexicalItemStore = {
      ja: [makeWord('edict-1', 'ja', 50)],
    };

    const merged = mergeSavedWords(local, cloud);
    expect(merged['ja']).toHaveLength(1);
  });

  it('handles empty local state', () => {
    const cloud: SavedLexicalItemStore = {
      ko: [makeWord('kengdic-1', 'ko', 100)],
    };
    const merged = mergeSavedWords({}, cloud);
    expect(merged['ko']).toHaveLength(1);
  });

  it('handles empty cloud state', () => {
    const local: SavedLexicalItemStore = {
      zh: [makeWord('cedict-1', 'zh', 100)],
    };
    const merged = mergeSavedWords(local, {});
    expect(merged['zh']).toHaveLength(1);
  });

  it('merges multiple languages', () => {
    const local: SavedLexicalItemStore = {
      zh: [makeWord('cedict-1', 'zh', 100)],
    };
    const cloud: SavedLexicalItemStore = {
      ja: [makeWord('edict-1', 'ja', 50)],
      ko: [makeWord('kengdic-1', 'ko', 200)],
    };

    const merged = mergeSavedWords(local, cloud);
    expect(Object.keys(merged).sort()).toEqual(['ja', 'ko', 'zh']);
    expect(merged['zh']).toHaveLength(1);
    expect(merged['ja']).toHaveLength(1);
    expect(merged['ko']).toHaveLength(1);
  });

  it('preserves local word data (does not overwrite)', () => {
    const localWord = makeWord('cedict-1', 'zh', 100);
    localWord.context = { form: 'local-form', text: 'Local context' };

    const cloudWord = makeWord('cedict-1', 'zh', 50);
    cloudWord.context = { form: 'cloud-form', text: 'Cloud context' };

    const local: SavedLexicalItemStore = { zh: [localWord] };
    const cloud: SavedLexicalItemStore = { zh: [cloudWord] };

    const merged = mergeSavedWords(local, cloud);
    expect(merged['zh']![0]!.context?.form).toBe('local-form');
  });
});

describe('pending-op queue (row API)', () => {
  function op(partial: Partial<PendingSavedWordOp>): PendingSavedWordOp {
    return {
      type: 'put',
      l2: 'zh',
      wordId: 'w1',
      updatedAt: 1,
      ...partial,
    };
  }

  it('replaces an older op for the same word', () => {
    const queue = enqueuePendingOp([], op({ wordId: 'w1', updatedAt: 1 }));
    const next = enqueuePendingOp(queue, op({ type: 'delete', wordId: 'w1', updatedAt: 2 }));
    expect(next).toHaveLength(1);
    expect(next[0]!.type).toBe('delete');
  });

  it('keeps ops for different words', () => {
    const queue = enqueuePendingOp([], op({ wordId: 'w1' }));
    const next = enqueuePendingOp(queue, op({ wordId: 'w2' }));
    expect(next).toHaveLength(2);
  });

  it('reduces to the newest op per word in timestamp order', () => {
    const reduced = reducePendingOps([
      op({ wordId: 'w1', updatedAt: 1 }),
      op({ wordId: 'w2', updatedAt: 3 }),
      op({ type: 'delete', wordId: 'w1', updatedAt: 2 }),
    ]);
    expect(reduced.map(o => o.wordId)).toEqual(['w1', 'w2']);
    expect(reduced[0]!.type).toBe('delete');
  });

  it('flushes ops and stops at the first failure', async () => {
    const calls: string[] = [];
    const api = {
      putSavedWord: async (l2: string, word: SavedLexicalItemRecord) => {
        calls.push(`put:${word.id}`);
        if (word.id === 'w2') throw new Error('offline');
      },
      deleteSavedWord: async (l2: string, wordId: string) => {
        calls.push(`delete:${wordId}`);
      },
    };
    const queue: PendingSavedWordOp[] = [
      op({ wordId: 'w1', updatedAt: 1, word: makeWord('w1', 'zh', 1) }),
      op({ wordId: 'w2', updatedAt: 2, word: makeWord('w2', 'zh', 2) }),
      op({ type: 'delete', wordId: 'w3', updatedAt: 3 }),
    ];
    const remaining = await flushPendingOps(queue, api);
    expect(calls).toEqual(['put:w1', 'put:w2']);
    expect(remaining.map(o => o.wordId)).toEqual(['w2', 'w3']);
  });
});

describe('collectMissingLocalWords', () => {
  it('returns only local words absent from the server store', () => {
    const server: SavedLexicalItemStore = { zh: [makeWord('w1', 'zh', 1)] };
    const local: SavedLexicalItemStore = {
      zh: [makeWord('w1', 'zh', 1), makeWord('w2', 'zh', 2)],
      ja: [makeWord('j1', 'ja', 3)],
    };
    const missing = collectMissingLocalWords(server, local);
    expect(missing.map(m => m.word.id).sort()).toEqual(['j1', 'w2']);
    expect(missing.map(m => m.l2).sort()).toEqual(['ja', 'zh']);
  });
});
