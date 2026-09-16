import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Material gathering for the offline test fallback (SPEC-066 § "Offline test
 * generation"). The question-building rules themselves are covered in
 * `packages/utils/src/srs-test-fallback.test.ts`; here the concern is that the
 * right offline material reaches them.
 */

const lookupEntriesSharingChar = vi.fn();
const getOfflineEntryById = vi.fn();

vi.mock('@/lib/logger', () => ({ log: () => {}, logwarn: () => {}, logerr: () => {} }));
vi.mock('@/lib/dictionary-db', () => ({
  lookupEntriesSharingChar: (...args: unknown[]) => lookupEntriesSharingChar(...args),
  getOfflineEntryById: (...args: unknown[]) => getOfflineEntryById(...args),
}));
vi.mock('@langplayer/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@langplayer/utils')>();
  return { ...actual, getCachedEntryById: () => undefined };
});

import { createSrsTestFallback } from './srs-test-fallback';

/** EDICT-shaped entries: `head` + `alternate` (kana). */
function jaEntry(head: string, alternate: string, definition = '') {
  return { id: head, head, alternate, definitions: definition ? [definition] : [], reading: alternate };
}

const DEFINITION_QUESTION = 'What does "{word}" mean in this sentence?';

beforeEach(() => {
  lookupEntriesSharingChar.mockReset();
  getOfflineEntryById.mockReset();
});

describe('createSrsTestFallback — pronunciation (ja)', () => {
  it('uses readings of dictionary words sharing a kanji', async () => {
    lookupEntriesSharingChar.mockImplementation(async (_l2: string, char: string) =>
      char === '一'
        ? [jaEntry('一番', 'いちばん'), jaEntry('一人', 'ひとり'), jaEntry('一月', 'いちがつ'), jaEntry('一年', 'いちねん')]
        : [],
    );
    const fallback = createSrsTestFallback({
      targetWordId: 'w1',
      savedWords: [],
      definitionQuestionText: DEFINITION_QUESTION,
    });

    const question = await fallback({
      kind: 'pronunciation',
      wordForm: '一番',
      context: '一番好きだ',
      l1Code: 'en',
      l2Code: 'ja',
      pronunciation: 'いちばん',
    });

    expect(question).not.toBeNull();
    expect(question!.kind).toBe('pronunciation');
    expect(question!.correctAnswer).toBe('いちばん');
    expect(question!.choices).toHaveLength(4);
    // The confounders are real readings of other 一 words, never the headword's own.
    expect(question!.choices).toContain('ひとり');
    expect(question!.choices.filter((c) => c === 'いちばん')).toHaveLength(1);
  });

  it('falls back to kana variants when the dictionary has nothing to offer', async () => {
    lookupEntriesSharingChar.mockResolvedValue([]);
    const fallback = createSrsTestFallback({
      targetWordId: 'w1',
      savedWords: [],
      definitionQuestionText: DEFINITION_QUESTION,
    });

    const question = await fallback({
      kind: 'pronunciation',
      wordForm: '一番',
      context: '',
      l1Code: 'en',
      l2Code: 'ja',
      pronunciation: 'いちばん',
    });
    expect(question).not.toBeNull();
    expect(question!.choices).toHaveLength(4);
  });

  it('builds nothing without a ground-truth reading (the LLM-hybrid case)', async () => {
    const fallback = createSrsTestFallback({
      targetWordId: 'w1',
      savedWords: [],
      definitionQuestionText: DEFINITION_QUESTION,
    });
    const question = await fallback({
      kind: 'pronunciation',
      wordForm: '羽交い締め',
      context: '',
      l1Code: 'en',
      l2Code: 'ja',
    });
    expect(question).toBeNull();
    expect(lookupEntriesSharingChar).not.toHaveBeenCalled();
  });
});

describe('createSrsTestFallback — definition', () => {
  it('builds nothing when only one other saved word has a definition', async () => {
    getOfflineEntryById.mockImplementation(async (_l2: string, id: string) =>
      id === 'nightmare' ? { id, head: id, definitions: ['a nightmare'] } : null,
    );
    const fallback = createSrsTestFallback({
      targetWordId: 'dream',
      savedWords: [
        { id: 'dream', form: '夢' },
        { id: 'nightmare', form: '夢魔' },
      ],
      definitionQuestionText: DEFINITION_QUESTION,
    });

    const question = await fallback({
      kind: 'definition',
      wordForm: '夢',
      context: '',
      l1Code: 'en',
      l2Code: 'ja',
      definition: 'a dream',
    });
    // One confounder is below the floor — the caller keeps its error box.
    expect(question).toBeNull();
  });

  it('prompts with the target word substituted into the localized question', async () => {
    getOfflineEntryById.mockImplementation(async (_l2: string, id: string) => ({
      id,
      head: id,
      definitions: [`definition of ${id}`],
    }));
    const fallback = createSrsTestFallback({
      targetWordId: 'dream',
      savedWords: [
        { id: 'dream', form: '夢' },
        { id: 'nightmare', form: '夢魔' },
        { id: 'illusion', form: '幻影' },
      ],
      definitionQuestionText: DEFINITION_QUESTION,
    });

    const question = await fallback({
      kind: 'definition',
      wordForm: '夢',
      context: '',
      l1Code: 'en',
      l2Code: 'ja',
      definition: 'a dream',
    });
    expect(question).not.toBeNull();
    expect(question!.prompt).toBe('What does "夢" mean in this sentence?');
    expect(question!.correctAnswer).toBe('a dream');
    expect(question!.choices).toContain('a dream');
  });

  it('builds a question when two similar words have definitions', async () => {
    getOfflineEntryById.mockImplementation(async (_l2: string, id: string) => ({
      id,
      head: id,
      definitions: [`definition of ${id}`],
    }));
    const fallback = createSrsTestFallback({
      targetWordId: 'dream',
      savedWords: [
        { id: 'dream', form: '夢' },
        { id: 'nightmare', form: '夢魔' },
        { id: 'illusion', form: '幻影' },
      ],
      definitionQuestionText: DEFINITION_QUESTION,
    });

    const question = await fallback({
      kind: 'definition',
      wordForm: '夢',
      context: '',
      l1Code: 'en',
      l2Code: 'ja',
      definition: 'a dream',
    });

    expect(question).not.toBeNull();
    expect(question!.choices).toHaveLength(3);
    expect(question!.choices).toContain('a dream');
    expect(question!.choices).not.toContain('definition of dream');
  });

  it('never asks the dictionary for the target word itself', async () => {
    getOfflineEntryById.mockResolvedValue({ id: 'x', head: 'x', definitions: ['somewhere else'] });
    const fallback = createSrsTestFallback({
      targetWordId: 'dream',
      savedWords: [
        { id: 'dream', form: '夢' },
        { id: 'a', form: '夢見' },
        { id: 'b', form: '夢想' },
      ],
      definitionQuestionText: DEFINITION_QUESTION,
    });
    await fallback({
      kind: 'definition',
      wordForm: '夢',
      context: '',
      l1Code: 'en',
      l2Code: 'ja',
      definition: 'a dream',
    });
    const askedIds = getOfflineEntryById.mock.calls.map((call) => call[1]);
    expect(askedIds).not.toContain('dream');
  });
});
