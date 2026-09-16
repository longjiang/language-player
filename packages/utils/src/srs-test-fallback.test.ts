import { describe, it, expect } from 'vitest';
import {
  buildFallbackTestQuestion,
  japaneseReadingVariants,
  rankSimilarWords,
} from './srs-test-fallback';
import { isObviousPronunciationWrong } from './srs-test-mode';

const base = {
  word: '一番',
  l1Code: 'en',
  l2Code: 'ja',
  definitionQuestionText: 'What does "{word}" mean in this sentence?',
};

describe('buildFallbackTestQuestion — pronunciation (SPEC-066 offline fallback)', () => {
  const input = {
    ...base,
    kind: 'pronunciation' as const,
    correctAnswer: 'いちばん',
  };

  it('builds a 4-choice question from dictionary readings sharing a kanji', () => {
    const q = buildFallbackTestQuestion({
      ...input,
      readingCandidates: ['ひとつばん', 'いちま', 'かずばん'],
    });
    expect(q).not.toBeNull();
    expect(q!.kind).toBe('pronunciation');
    expect(q!.correctAnswer).toBe('いちばん');
    expect(q!.choices).toHaveLength(4);
    expect(q!.choices).toContain('いちばん');
    expect(q!.prompt).toContain('一番');
  });

  it('drops duplicates, non-hiragana and "obvious wrong" candidates', () => {
    const q = buildFallbackTestQuestion({
      ...input,
      readingCandidates: [
        'いちばん',        // the correct answer
        '一番',            // not hiragana
        'いちばんご',      // extends the correct reading (obvious wrong)
        'ばん',            // truncates it (obvious wrong)
        'ひとつばん',
        'かずばん',
        'いちま',
        'みつばん',        // beyond the 3 needed
      ],
    });
    expect(q!.choices).toHaveLength(4);
    for (const choice of q!.choices) {
      expect(choice).not.toBe('一番');
      expect(isObviousPronunciationWrong(choice, 'いちばん')).toBe(false);
    }
    expect(q!.choices.filter((c) => c === 'いちばん')).toHaveLength(1);
  });

  it('tops up with deterministic kana variants when the dictionary offers too few', () => {
    const q = buildFallbackTestQuestion({ ...input, readingCandidates: ['ひとつばん'] });
    expect(q).not.toBeNull();
    expect(q!.choices).toHaveLength(4);
    // いっちばん (促音) and a voicing swap of the same reading.
    expect(q!.choices).toContain('いっちばん');
    expect(q!.choices.some((c) => c.includes('ぱ') || c.includes('は'))).toBe(true);
    for (const choice of q!.choices) {
      expect(isObviousPronunciationWrong(choice, 'いちばん')).toBe(false);
    }
  });

  it('returns null when it cannot reach 4 valid choices', () => {
    // っ/voicing swaps are impossible on a single-mora reading with no candidates.
    expect(buildFallbackTestQuestion({ ...input, correctAnswer: 'ん', readingCandidates: [] })).toBeNull();
  });

  it('returns null without a ground-truth reading (the LLM-hybrid case)', () => {
    expect(buildFallbackTestQuestion({ ...input, correctAnswer: '', readingCandidates: ['あ'] })).toBeNull();
  });

  it('returns null when the ground truth is not hiragana', () => {
    expect(
      buildFallbackTestQuestion({ ...input, correctAnswer: 'ichiban', readingCandidates: ['ひとつばん'] }),
    ).toBeNull();
  });
});

describe('japaneseReadingVariants', () => {
  it('produces voicing swaps and a 促音 insertion, never the reading itself', () => {
    const variants = japaneseReadingVariants('いちばん');
    expect(variants).toContain('いっちばん');
    expect(variants).toContain('いちはん');
    expect(variants).not.toContain('いちばん');
    // None of them may contain the correct reading (that would be an obvious wrong).
    for (const variant of variants) {
      expect(isObviousPronunciationWrong(variant, 'いちばん')).toBe(false);
    }
  });
});

describe('buildFallbackTestQuestion — definition (SPEC-066 offline fallback)', () => {
  const input = {
    ...base,
    word: '夢',
    kind: 'definition' as const,
    correctAnswer: 'a dream',
  };

  it('builds a question from other words’ first definitions', () => {
    const q = buildFallbackTestQuestion({
      ...input,
      definitionCandidates: ['a nightmare', 'an illusion', 'a memory'],
    });
    expect(q).not.toBeNull();
    expect(q!.prompt).toBe('What does "夢" mean in this sentence?');
    expect(q!.choices).toHaveLength(4);
    expect(q!.choices).toContain('a dream');
  });

  it('requires at least two confounders', () => {
    expect(buildFallbackTestQuestion({ ...input, definitionCandidates: ['a nightmare'] })).toBeNull();
    expect(buildFallbackTestQuestion({ ...input, definitionCandidates: [] })).toBeNull();
  });

  it('never reuses the correct answer as a confounder', () => {
    const q = buildFallbackTestQuestion({
      ...input,
      definitionCandidates: ['a dream', 'a nightmare', 'an illusion'],
    });
    // The duplicate is dropped, leaving the two real confounders (the floor).
    expect(q!.choices.filter((c) => c === 'a dream')).toHaveLength(1);
    expect(q!.choices).toHaveLength(3);
  });

  it('keeps the choice lengths comparable so length cannot reveal the answer', () => {
    // A very long correct answer with only short candidates cannot be made fair.
    expect(
      buildFallbackTestQuestion({
        ...input,
        correctAnswer: 'a vivid sequence of images and feelings experienced while asleep',
        definitionCandidates: ['a nap', 'a bed'],
      }),
    ).toBeNull();
    // With a comparable-length pool it is built.
    const q = buildFallbackTestQuestion({
      ...input,
      correctAnswer: 'a vivid sequence of images and feelings experienced while asleep',
      definitionCandidates: [
        'a short series of sounds heard while walking outside',
        'a strong feeling of hunger felt in the late afternoon',
      ],
    });
    expect(q).not.toBeNull();
    expect(q!.choices).toHaveLength(3);
  });

  it('returns null without a question text or a correct answer', () => {
    expect(
      buildFallbackTestQuestion({ ...input, definitionQuestionText: '', definitionCandidates: ['a', 'b'] }),
    ).toBeNull();
    expect(
      buildFallbackTestQuestion({ ...input, correctAnswer: '', definitionCandidates: ['a', 'b'] }),
    ).toBeNull();
  });
});

describe('rankSimilarWords', () => {
  const candidates = [
    { id: '1', form: '夢物語' },   // shares 夢
    { id: '2', form: '幻' },
    { id: '3', form: '夢' },       // the target itself (caller excludes it)
    { id: '4', form: '現実' },
  ];

  it('ranks words sharing a character with the target first', () => {
    const ranked = rankSimilarWords('夢', candidates.filter((c) => c.id !== '3'));
    expect(ranked[0]!.id).toBe('1');
  });

  it('ignores empty forms and honours the limit', () => {
    const ranked = rankSimilarWords('夢', [{ id: 'x', form: '  ' }, ...candidates], 2);
    expect(ranked).toHaveLength(2);
    expect(ranked.every((c) => c.form.trim())).toBe(true);
  });
});
