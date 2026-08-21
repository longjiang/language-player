import { describe, expect, it } from 'vitest';
import { normalizeTestChoice, parseSrsQuestionResponse } from './srs-test-mode';

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
