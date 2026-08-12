import { describe, expect, it } from 'vitest';
import {
  canCoalesceOps,
  coalesceSyncPayload,
  repairSyncPayload,
  validateSyncPayload,
  getSyncEntityDef,
} from './sync-entities';

describe('validateSyncPayload', () => {
  it('rejects unknown entities loudly', () => {
    expect(() => validateSyncPayload('nope', {})).toThrow(/unknown sync entity/);
  });

  it('rejects partial note payloads (the create → edit → rename bug)', () => {
    expect(() => validateSyncPayload('note', { l2: 'ja', title: 'T' })).toThrow(
      /missing required key: text/,
    );
  });

  it('accepts full-row note payloads', () => {
    expect(() =>
      validateSyncPayload('note', { l2: 'ja', title: 'T', text: 'B', translation: '' }),
    ).not.toThrow();
  });

  it('rejects wrong field types', () => {
    expect(() =>
      validateSyncPayload('watch_history', { videoId: 'not-a-number' }),
    ).toThrow(/must be number/);
  });
});

describe('coalesceSyncPayload', () => {
  it('never drops fields across a note create → edit → rename sequence', () => {
    const created = { l2: 'ja', title: 'Untitled', text: '', translation: '' };
    const edited = coalesceSyncPayload('note', created, {
      l2: 'ja',
      title: 'Untitled',
      text: '本文',
      translation: '',
    });
    const renamed = coalesceSyncPayload('note', edited, {
      l2: 'ja',
      title: 'New name',
      text: '本文',
      translation: '',
    });
    expect(renamed).toEqual({ l2: 'ja', title: 'New name', text: '本文', translation: '' });
  });

  it('whole-row entities replace payloads', () => {
    const a = coalesceSyncPayload('saved_word', { l2: 'ja', wordId: 'w', word: { id: 'w' } }, { l2: 'ja', wordId: 'w', word: { id: 'w', forms: ['x'] } });
    expect(a.word).toEqual({ id: 'w', forms: ['x'] });
  });

  it('all registered entities expose a coalesce function', () => {
    for (const entity of [
      'note',
      'saved_word',
      'progress',
      'srs_card',
      'settings',
      'watch_history',
    ]) {
      expect(getSyncEntityDef(entity)?.coalesce).toBeTypeOf('function');
    }
  });
});

describe('canCoalesceOps', () => {
  it('coalesces same op types (keeping the idempotency key)', () => {
    expect(canCoalesceOps('upsert', 'upsert')).toBe(true);
    expect(canCoalesceOps('delete', 'delete')).toBe(true);
  });

  it('op-type change (upsert → delete) must create a new row + fresh key', () => {
    expect(canCoalesceOps('upsert', 'delete')).toBe(false);
    expect(canCoalesceOps('delete', 'upsert')).toBe(false);
  });
});

describe('repairSyncPayload', () => {
  it('fills missing note fields from source then defaults', () => {
    const repaired = repairSyncPayload(
      'note',
      { l2: 'ja', text: 'body' },
      { l2: 'ja', title: 'Cached title', translation: '' },
    );
    expect(repaired).toEqual({ l2: 'ja', text: 'body', title: 'Cached title', translation: '' });
  });

  it('uses defaults when source has no value (legacy pre-fix rows)', () => {
    const repaired = repairSyncPayload('note', { l2: 'ja' }, null);
    expect(repaired).toEqual({ l2: 'ja', title: 'Untitled', text: '', translation: '' });
  });

  it('leaves payloads that cannot be repaired (missing l2) untouched', () => {
    const repaired = repairSyncPayload('note', { title: 'T' }, null);
    expect(repaired.title).toBe('T');
    expect(repaired.l2).toBeUndefined();
  });
});
