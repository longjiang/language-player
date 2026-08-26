import { describe, expect, it } from 'vitest';
import {
  buildPronunciationQuestionText,
  buildSrsQuestionPrompt,
  getTestKinds,
  isObviousPronunciationWrong,
  lemmaFormOf,
  needsPronunciationTest,
  normalizeTestChoice,
  parseSrsQuestionResponse,
  scoreTestResult,
  surfaceFormOf,
  validateSrsPronunciationChoices,
} from './srs-test-mode';

describe('parseSrsQuestionResponse', () => {
  const json = JSON.stringify({
    kind: 'definition',
    question: 'What does this word mean?',
    correct_answer: 'meaning',
    confounders: ['one', 'two', 'three'],
  });

  it('parses plain JSON', () => {
    expect(parseSrsQuestionResponse(json).correct_answer).toBe('meaning');
  });

  it('parses JSON wrapped in a markdown fence', () => {
    expect(parseSrsQuestionResponse(`\`\`\`json\n${json}\n\`\`\``).kind).toBe('definition');
  });

  it('parses a response with an omitted closing fence', () => {
    expect(parseSrsQuestionResponse(`\`\`\`json\n${json}`).confounders).toHaveLength(3);
  });

  it('rejects non-object JSON', () => {
    expect(() => parseSrsQuestionResponse('[1, 2, 3]')).toThrow();
  });

  it('normalizes internal whitespace when deduplicating choices', () => {
    expect(normalizeTestChoice('  very   good  ')).toBe('very good');
  });
});

describe('isObviousPronunciationWrong', () => {
  it('flags a confounder that appends junk to the correct reading', () => {
    expect(isObviousPronunciationWrong('つきものぬ', 'つきもの')).toBe(true);
    expect(isObviousPronunciationWrong('つきものだ', 'つきもの')).toBe(true);
  });

  it('flags a confounder that truncates the correct reading', () => {
    expect(isObviousPronunciationWrong('もの', 'つきもの')).toBe(true);
    expect(isObviousPronunciationWrong('つきも', 'つきもの')).toBe(true);
  });

  it('accepts real alternative readings that differ from the correct one', () => {
    // Mixed kana/kanji: kana part つき held constant, only the kanji reading
    // varies (the user-requested confound style).
    expect(isObviousPronunciationWrong('つきぶつ', 'つきもの')).toBe(false);
    expect(isObviousPronunciationWrong('つきもつ', 'つきもの')).toBe(false);
    expect(isObviousPronunciationWrong('つきもち', 'つきもの')).toBe(false);
    expect(isObviousPronunciationWrong('つきがみ', 'つきもの')).toBe(false);
  });

  it('accepts the correct answer itself and empty strings', () => {
    expect(isObviousPronunciationWrong('つきもの', 'つきもの')).toBe(false);
    expect(isObviousPronunciationWrong('', 'つきもの')).toBe(false);
    expect(isObviousPronunciationWrong('つきもの', '')).toBe(false);
  });
});

describe('validateSrsPronunciationChoices', () => {
  it('returns a reason when any confounder is an obvious wrong', () => {
    const problem = validateSrsPronunciationChoices({
      correctAnswer: 'つきもの',
      choices: ['つきもの', 'つきぶつ', 'つきものぬ', 'つきがみ'],
    });
    expect(problem).toContain('つきものぬ');
  });

  it('returns null when every confounder is plausible', () => {
    expect(validateSrsPronunciationChoices({
      correctAnswer: 'つきもの',
      choices: ['つきもの', 'つきぶつ', 'つきもつ', 'つきがみ'],
    })).toBeNull();
  });
});

describe('scoreTestResult', () => {
  it('both correct and fast (<10s for 2 tests) → easy', () => {
    expect(scoreTestResult(2, 2, 8_000)).toBe('easy');
  });

  it('both correct mid-speed (10–20s for 2 tests) → good', () => {
    expect(scoreTestResult(2, 2, 15_000)).toBe('good');
  });

  it('both correct and slow (>20s for 2 tests) → hard', () => {
    expect(scoreTestResult(2, 2, 25_000)).toBe('hard');
  });

  it('one of two correct → hard (no time adjustment)', () => {
    expect(scoreTestResult(1, 2, 5_000)).toBe('hard');
    expect(scoreTestResult(1, 2, 50_000)).toBe('hard');
  });

  it('none correct → again', () => {
    expect(scoreTestResult(0, 2, 5_000)).toBe('again');
  });

  it('single test correct and fast (<5s) → easy (scaled to 2, fast → easy)', () => {
    expect(scoreTestResult(1, 1, 4_000)).toBe('easy');
  });

  it('single test correct mid-speed (5–10s) → good', () => {
    expect(scoreTestResult(1, 1, 7_000)).toBe('good');
  });

  it('single test correct and slow (>10s) → hard', () => {
    expect(scoreTestResult(1, 1, 12_000)).toBe('hard');
  });

  it('single test wrong → again', () => {
    expect(scoreTestResult(0, 1, 4_000)).toBe('again');
  });
});

describe('needsPronunciationTest (surface-form contract)', () => {
  it('suppresses the Japanese pronunciation test when the surface form is kana-only', () => {
    expect(needsPronunciationTest('ja', 'しかるべき')).toBe(false);
    expect(needsPronunciationTest('ja', 'おしきられる')).toBe(false);
  });

  it('shows the Japanese pronunciation test when the surface form contains kanji', () => {
    expect(needsPronunciationTest('ja', '然るべき')).toBe(true);
    expect(needsPronunciationTest('ja', '押し切られ')).toBe(true);
  });

  it('always tests pronunciation for other deep-orthography L2s', () => {
    expect(needsPronunciationTest('zh', '他')).toBe(true);
    expect(needsPronunciationTest('ko', '한국어')).toBe(true);
  });

  it('never tests pronunciation for shallow orthographies', () => {
    expect(needsPronunciationTest('en', 'word')).toBe(false);
    expect(needsPronunciationTest('es', 'palabra')).toBe(false);
  });

  it('falls back to testing when no surface form is available', () => {
    expect(needsPronunciationTest('ja')).toBe(true);
  });
});

describe('getTestKinds (pronunciation first)', () => {
  it('orders pronunciation before definition when both tests run', () => {
    expect(getTestKinds('ja', '然るべき')).toEqual(['pronunciation', 'definition']);
    expect(getTestKinds('zh', '他')).toEqual(['pronunciation', 'definition']);
  });

  it('returns a single definition test when pronunciation is suppressed', () => {
    expect(getTestKinds('ja', 'しかるべき')).toEqual(['definition']);
    expect(getTestKinds('en', 'word')).toEqual(['definition']);
  });

  it('matches needsPronunciationTest for the same inputs', () => {
    for (const [l2, surface] of [
      ['ja', '然るべき'],
      ['ja', 'しかるべき'],
      ['zh', '他'],
      ['en', 'word'],
      ['ja', undefined],
    ] as const) {
      const kinds = getTestKinds(l2, surface);
      const expectPron = needsPronunciationTest(l2, surface);
      expect(kinds.includes('pronunciation')).toBe(expectPron);
      if (expectPron) {
        expect(kinds[0]).toBe('pronunciation');
        expect(kinds[1]).toBe('definition');
      } else {
        expect(kinds).toEqual(['definition']);
      }
    }
  });
});

describe('buildPronunciationQuestionText', () => {
  it('keeps the headword and renders in the L1', () => {
    expect(buildPronunciationQuestionText('反る', 'zh-Hans')).toBe('「反る」怎么读？');
    expect(buildPronunciationQuestionText('反る', 'en')).toBe('How is "反る" pronounced?');
  });
  it('resolves the base L1 code (review pages pass baseCode(l1.code))', () => {
    // baseCode("zh-Hans") → "zh"; the review page passes that as l1Code, so the
    // pronunciation question must render in Chinese — not fall back to English.
    expect(buildPronunciationQuestionText('痛烈', 'zh')).toBe('「痛烈」怎么读？');
    expect(buildPronunciationQuestionText('痛烈', 'ja')).toBe('「痛烈」はどう読みますか？');
  });
  it('prefers a full script key when present (zh-Hant varies)', () => {
    expect(buildPronunciationQuestionText('反る', 'zh-Hant')).toBe('「反る」怎麼讀？');
  });
  it('falls back to English for unmapped L1', () => {
    expect(buildPronunciationQuestionText('word', 'xx')).toBe('How is "word" pronounced?');
  });
});

describe('surfaceFormOf / lemmaFormOf', () => {
  const word = {
    head: '押し切る',
    forms: ['押し切る', '押し切られ'],
    context: { form: '押し切られ' },
    instances: [{ form: '押し切られ' }],
  };

  it('surfaceFormOf returns the form as it appears in the context', () => {
    expect(surfaceFormOf(word, 'fallback')).toBe('押し切られ');
  });

  it('surfaceFormOf falls back through instances, then the fallback', () => {
    expect(surfaceFormOf({ ...word, context: undefined }, 'fallback')).toBe('押し切られ');
    expect(surfaceFormOf({ head: 'x', forms: ['x'] }, 'fallback')).toBe('fallback');
    expect(surfaceFormOf(undefined, 'fallback')).toBe('fallback');
  });

  it('lemmaFormOf prefers the head form', () => {
    expect(lemmaFormOf(word, 'fallback')).toBe('押し切る');
  });

  it('lemmaFormOf falls back to forms[0], then the fallback', () => {
    expect(lemmaFormOf({ forms: ['押し切る', '押し切られ'] }, 'fallback')).toBe('押し切る');
    expect(lemmaFormOf({ forms: [] }, 'fallback')).toBe('fallback');
    expect(lemmaFormOf(undefined, 'fallback')).toBe('fallback');
  });

  it('lemmaFormOf skips placeholder heads and forms', () => {
    expect(lemmaFormOf({ head: '?', forms: ['押し切る'] }, 'fallback')).toBe('押し切る');
    expect(lemmaFormOf({ head: '押し切る', forms: ['?'] }, 'fallback')).toBe('押し切る');
  });
});

describe('buildSrsQuestionPrompt (terse, language-specific)', () => {
  it('names the language and uses the L2-specific notation, distractor-only', () => {
    const ja = buildSrsQuestionPrompt({
      word: '押し切る', contextSentence: '彼は反対を押し切って決行した。',
      l1Code: 'en', l2Code: 'ja', kind: 'pronunciation', pronunciation: 'おしきる',
    });
    expect(ja).toContain('tests the pronunciation of a Japanese phrase');
    expect(ja).toContain('hiragana only');
    expect(ja).toContain('never derived/inflected forms of it');
    expect(ja).toContain('correct_answer (the headword\'s reading): おしきる');
    expect(ja).toContain('Generate ONLY 3 confounder');
    expect(ja).toContain('Output valid JSON only, no markdown');
    // The model is NOT asked to write the question or the correct answer.
    expect(ja).not.toContain('"question"');
    // The model is not asked to compose the question text.
    expect(ja).not.toMatch(/Ask how the target word is pronounced/);
    expect(ja).not.toContain('pinyin');
    expect(ja).not.toContain('Chinese');

    const zh = buildSrsQuestionPrompt({
      word: '决定', contextSentence: '我决定明天去北京。',
      l1Code: 'en', l2Code: 'zh', kind: 'pronunciation',
    });
    expect(zh).toContain('tests the pronunciation of a Chinese phrase');
    expect(zh).toContain('pinyin with tone marks');
    expect(zh).not.toContain('hiragana');
    expect(zh).not.toContain('kana');
    expect(zh).not.toContain('kanji');
  });

  it('definition prompt names the language and L1 for the answers', () => {
    const def = buildSrsQuestionPrompt({
      word: '押し切る', contextSentence: '彼は反対を押し切って決行した。',
      l1Code: 'en', l2Code: 'ja', kind: 'definition',
    });
    expect(def).toContain('tests the meaning of a Japanese phrase');
    expect(def).toContain('concise en definitions');
    expect(def).not.toContain('hiragana');
    expect(def).not.toContain('pronunciation');
  });
});
