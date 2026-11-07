// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { DictionaryEntry, SavedLexicalItemRecord } from '@langplayer/shared';
import type { FsrsCard } from '@langplayer/utils';

const mocks = vi.hoisted(() => ({
  enqueueLookupWords: vi.fn<
    (words: { text: string; l2Code: string }[], apiUrl: string) => Promise<boolean>
  >(async () => true),
  getCachedEntryById: vi.fn(),
  getCachedEntries: vi.fn(),
}));

vi.mock('@langplayer/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@langplayer/utils')>();
  return {
    ...actual,
    enqueueLookupWords: mocks.enqueueLookupWords,
    getCachedEntryById: mocks.getCachedEntryById,
    getCachedEntries: mocks.getCachedEntries,
  };
});
vi.mock('@/lib/logger', () => ({ log: vi.fn(), logwarn: vi.fn() }));

import { useNewCardLevels, languageHasWordLevels } from '@/hooks/use-new-card-levels';

const NOW = Date.parse('2026-11-08T00:00:00Z');

/** Entry cache used by the mocked cache getters. */
let entryCache: Map<string, DictionaryEntry>;

function entry(id: string, overrides: Partial<DictionaryEntry> = {}): DictionaryEntry {
  return {
    kind: 'dictionary',
    id,
    head: id,
    definitions: [],
    pronunciation: '',
    levels: null,
    frequencyLevel: null,
    ...overrides,
  } as DictionaryEntry;
}

function word(id: string, date = NOW): SavedLexicalItemRecord {
  return { id, forms: [id], date };
}

const noCards: Record<string, FsrsCard> = {};

describe('useNewCardLevels (SPEC-066 level-first new-card ordering)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    entryCache = new Map();
    mocks.getCachedEntryById.mockImplementation((_l2: string, id: string) => entryCache.get(id));
    mocks.getCachedEntries.mockReturnValue(undefined);
    mocks.enqueueLookupWords.mockResolvedValue(true);
  });

  it('skips resolution for a language without frequency data', () => {
    expect(languageHasWordLevels('zh')).toBe(true);
    expect(languageHasWordLevels('la')).toBe(false);

    const { result } = renderHook(() => useNewCardLevels('la', [word('w')], noCards));
    expect(result.current.ready).toBe(true);
    expect(result.current.levels).toEqual({});
    expect(mocks.enqueueLookupWords).not.toHaveBeenCalled();
  });

  it('uses levels already in the dictionary cache without a lookup', () => {
    entryCache.set('w', entry('w', { frequencyLevel: 3 }));
    const { result } = renderHook(() => useNewCardLevels('zh', [word('w')], noCards));
    expect(result.current.ready).toBe(true);
    expect(result.current.levels).toEqual({ w: 3 });
    expect(mocks.enqueueLookupWords).not.toHaveBeenCalled();
  });

  it('reads canonical exam levels, not just frequency levels', () => {
    entryCache.set(
      'w',
      entry('w', { levels: [{ scale: 'hsk_2025', value: '2', numeric: 2 }] }),
    );
    const { result } = renderHook(() => useNewCardLevels('zh', [word('w')], noCards));
    expect(result.current.levels).toEqual({ w: 2 });
  });

  it('gates the deck on the batch lookup and then resolves levels', async () => {
    let release!: () => void;
    mocks.enqueueLookupWords.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          release = () => {
            entryCache.set('w', entry('w', { frequencyLevel: 1 }));
            resolve(true);
          };
        }),
    );

    const { result } = renderHook(() => useNewCardLevels('zh', [word('w')], noCards));
    // Not ready yet: minting must wait for the lookup (SPEC-066).
    expect(result.current.ready).toBe(false);
    expect(mocks.enqueueLookupWords).toHaveBeenCalledTimes(1);

    release();
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.levels).toEqual({ w: 1 });
  });

  it('falls back to unclassified when the lookup fails', async () => {
    mocks.enqueueLookupWords.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useNewCardLevels('zh', [word('w')], noCards));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.levels).toEqual({ w: null });
  });

  it('does not re-request words it already resolved', async () => {
    mocks.enqueueLookupWords.mockImplementation(async () => true);
    const { result, rerender } = renderHook(
      ({ words }) => useNewCardLevels('zh', words, noCards),
      { initialProps: { words: [word('w')] } },
    );
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(mocks.enqueueLookupWords).toHaveBeenCalledTimes(1);

    // A newer save joins the candidate set: only that word is looked up.
    rerender({ words: [word('w'), word('v', NOW + 1000)] });
    await waitFor(() => expect(result.current.levels).toHaveProperty('v'));
    expect(mocks.enqueueLookupWords).toHaveBeenCalledTimes(2);
    const lastRequest = mocks.enqueueLookupWords.mock.calls[1]?.[0] as { text: string }[];
    expect(lastRequest.map((w) => w.text)).toEqual(['v']);
  });
});
