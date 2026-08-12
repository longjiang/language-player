import { describe, it, expect } from 'vitest';
import { isSameEntryId, decomposeWordId } from '@langplayer/shared';

describe('word-id-resolver (SPEC-066 saved-entry matching)', () => {
  it('matches identical ids directly', () => {
    expect(isSameEntryId('93628', '93628', 'ja')).toBe(true);
    expect(isSameEntryId('llm-ja-abc123', 'llm-ja-abc123', 'ja')).toBe(true);
  });

  it('matches the scoped form of an llm-prefixed saved id', () => {
    expect(isSameEntryId('llm-ja-abc123', 'ja-abc123', 'ja')).toBe(true);
  });

  it('rejects different entries', () => {
    expect(isSameEntryId('llm-ja-abc123', 'llm-ja-other', 'ja')).toBe(false);
    expect(isSameEntryId('93628', '93629', 'ja')).toBe(false);
    expect(isSameEntryId('93628', undefined, 'ja')).toBe(false);
  });

  it('decomposes llm ids for the /dictionary/entry endpoint', () => {
    expect(decomposeWordId('llm-ja-abc123', 'ja')).toEqual({ dict: 'llm', id: 'ja-abc123' });
  });
});
