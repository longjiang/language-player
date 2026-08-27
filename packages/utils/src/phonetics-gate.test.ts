import { describe, it, expect } from 'vitest';
import type { DictionaryEntry } from '@langplayer/shared';
import { setCachedEntries } from './dictionary-cache';
import { getWordDifficulty, shouldShowPhonetics } from './phonetics-gate';

type Level = { scale: string; value: string; numeric: number };

function entry(id: string, opts: { levels?: Level[]; freq?: number }): DictionaryEntry {
  return {
    id,
    definitions: ['def'],
    ...(opts.levels ? { levels: opts.levels } : {}),
    ...(opts.freq !== undefined ? { frequencyLevel: opts.freq } : {}),
  } as unknown as DictionaryEntry;
}

describe('getWordDifficulty', () => {
  it('returns not_cached when no entry is cached', () => {
    expect(getWordDifficulty('ja', [{ lemma: 'uncached' }])).toEqual({ kind: 'not_cached' });
  });

  it('returns the lowest numeric level across lemmas', () => {
    setCachedEntries('ja', 'hard', [entry('id-hard', { levels: [{ scale: 'jlpt', value: 'N3', numeric: 4 }] })]);
    setCachedEntries('ja', 'easy', [entry('id-easy', { levels: [{ scale: 'jlpt', value: 'N5', numeric: 2 }] })]);
    const diff = getWordDifficulty('ja', [{ lemma: 'hard' }, { lemma: 'easy' }]);
    expect(diff).toEqual({ kind: 'classified', value: 2 });
  });

  it('combines frequencyLevel with levels[].numeric', () => {
    setCachedEntries('ja', 'freq', [entry('id-freq', { freq: 6 })]);
    expect(getWordDifficulty('ja', [{ lemma: 'freq' }])).toEqual({ kind: 'classified', value: 6 });
  });

  it('treats cached entry without levels/frequency as unclassified', () => {
    setCachedEntries('ja', 'nolevels', [entry('id-nolevels', {})]);
    expect(getWordDifficulty('ja', [{ lemma: 'nolevels' }])).toEqual({ kind: 'unclassified' });
  });
});

describe('shouldShowPhonetics', () => {
  const base = { phoneticsOn: true, scope: 'all' as const, l2Code: 'ja', lemmas: [{ lemma: 'x' }] };

  it('hides when phonetics are off', () => {
    expect(shouldShowPhonetics({ ...base, phoneticsOn: false })).toBe(false);
  });

  it('shows always under scope all', () => {
    expect(shouldShowPhonetics({ ...base, scope: 'all' })).toBe(true);
  });

  it('shows all words when no learner level is set under hard scope', () => {
    expect(shouldShowPhonetics({ ...base, scope: 'hard', userLevel: 0 })).toBe(true);
  });

  it('defers uncached words under hard scope (waits for batch lookup)', () => {
    expect(shouldShowPhonetics({ ...base, scope: 'hard', userLevel: 3 })).toBe(false);
  });

  it('shows words above the learner level under hard scope', () => {
    setCachedEntries('ja', 'x', [entry('id-x', { levels: [{ scale: 'jlpt', value: 'N2', numeric: 5 }] })]);
    expect(shouldShowPhonetics({ ...base, scope: 'hard', userLevel: 3 })).toBe(true);
  });

  it('hides words easier than the learner level under hard scope', () => {
    setCachedEntries('ja', 'y', [entry('id-y', { levels: [{ scale: 'jlpt', value: 'N5', numeric: 2 }] })]);
    expect(shouldShowPhonetics({ ...base, scope: 'hard', userLevel: 3, lemmas: [{ lemma: 'y' }] })).toBe(false);
  });

  it('shows words at the learner level under hard scope', () => {
    setCachedEntries('ja', 'z', [entry('id-z', { levels: [{ scale: 'jlpt', value: 'N4', numeric: 3 }] })]);
    expect(shouldShowPhonetics({ ...base, scope: 'hard', userLevel: 3, lemmas: [{ lemma: 'z' }] })).toBe(true);
  });
});
