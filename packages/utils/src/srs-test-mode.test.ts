import { describe, expect, it } from 'vitest';
import {
  isObviousPronunciationWrong,
  normalizeTestChoice,
  parseSrsQuestionResponse,
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
