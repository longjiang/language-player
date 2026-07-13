/**
 * Tests for saved words data transformations.
 * Verifies local/cloud merge logic, JSON serialization, and edge cases.
 */
import { describe, it, expect } from 'vitest';
import type { SavedWords, SavedWord } from '@langplayer/shared';
import { mergeSavedWords } from './use-saved-words';

function makeWord(id: string, l2: string, date: number): SavedWord {
  return {
    id,
    forms: [id],
    date,
    context: { form: id, text: `Example sentence with ${id}` },
  };
}

describe('mergeSavedWords', () => {
  it('adds cloud words not present locally', () => {
    const local: SavedWords = {
      zh: [makeWord('cedict-1', 'zh', 100)],
    };
    const cloud: SavedWords = {
      zh: [makeWord('cedict-1', 'zh', 50), makeWord('cedict-2', 'zh', 200)],
    };

    const merged = mergeSavedWords(local, cloud);
    expect(merged['zh']).toHaveLength(2);
    expect(merged['zh']!.map(w => w.id).sort()).toEqual(['cedict-1', 'cedict-2']);
  });

  it('does not duplicate words already present locally', () => {
    const local: SavedWords = {
      ja: [makeWord('edict-1', 'ja', 100)],
    };
    const cloud: SavedWords = {
      ja: [makeWord('edict-1', 'ja', 50)],
    };

    const merged = mergeSavedWords(local, cloud);
    expect(merged['ja']).toHaveLength(1);
  });

  it('handles empty local state', () => {
    const cloud: SavedWords = {
      ko: [makeWord('kengdic-1', 'ko', 100)],
    };
    const merged = mergeSavedWords({}, cloud);
    expect(merged['ko']).toHaveLength(1);
  });

  it('handles empty cloud state', () => {
    const local: SavedWords = {
      zh: [makeWord('cedict-1', 'zh', 100)],
    };
    const merged = mergeSavedWords(local, {});
    expect(merged['zh']).toHaveLength(1);
  });

  it('merges multiple languages', () => {
    const local: SavedWords = {
      zh: [makeWord('cedict-1', 'zh', 100)],
    };
    const cloud: SavedWords = {
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

    const local: SavedWords = { zh: [localWord] };
    const cloud: SavedWords = { zh: [cloudWord] };

    const merged = mergeSavedWords(local, cloud);
    expect(merged['zh']![0]!.context.form).toBe('local-form');
  });
});
