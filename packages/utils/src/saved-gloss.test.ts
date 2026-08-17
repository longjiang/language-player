import { describe, expect, it } from 'vitest';
import { pickSavedEntry } from './saved-gloss';
import type { DictionaryEntry } from '@langplayer/shared';

function entry(id: string, head: string): DictionaryEntry {
  return {
    kind: 'dictionary',
    id,
    head,
    dictionary: { id: 'cedict', name: 'CEDICT', version: '2026' },
    match_type: 'exact',
    definitions: [{ text: 'def', l1: [] }],
    source: 'hsk-cedict',
  } as unknown as DictionaryEntry;
}

describe('pickSavedEntry', () => {
  it('returns undefined without a saved id or entries', () => {
    expect(pickSavedEntry(undefined, 'x', 'zh')).toBeUndefined();
    expect(pickSavedEntry([], 'x', 'zh')).toBeUndefined();
    expect(pickSavedEntry([entry('a', 'A')], undefined, 'zh')).toBeUndefined();
  });

  it('prefers the entry matching the saved id over the first result', () => {
    const results = [entry('cedict-1', 'bank'), entry('cedict-2', 'bank')];
    const picked = pickSavedEntry(results, 'cedict-2', 'zh');
    expect(picked?.id).toBe('cedict-2');
  });

  it('matches CEDICT comma-separated ids', () => {
    const results = [entry('寬廣,kuān_guǎng,0', '寬廣'), entry('寬廣,kuān_guǎng,1', '寬廣')];
    const picked = pickSavedEntry(results, '寬廣,kuān_guǎng,1', 'zh');
    expect(picked?.id).toBe('寬廣,kuān_guǎng,1');
  });

  it('matches LLM saved ids against scoped API ids', () => {
    const results = [entry('ja-56818f257212', 'hello'), entry('ja-other', 'hello')];
    const picked = pickSavedEntry(results, 'llm-ja-56818f257212', 'ja');
    expect(picked?.id).toBe('ja-56818f257212');
  });

  it('returns undefined when no result matches the saved id', () => {
    const results = [entry('cedict-1', 'bank')];
    expect(pickSavedEntry(results, 'cedict-99', 'zh')).toBeUndefined();
  });
});
