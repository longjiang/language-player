import { describe, it, expect } from 'vitest';
import { tokenMatchesAnyTerm, tokenMatchesAnyForm } from './highlight-match';

const inflected = {
  text: '押し切られ',
  lemmas: [{ lemma: '押し切る' }, { lemma: 'れる' }],
};

describe('highlight-match (SPEC-066 inflected saved-word highlighting)', () => {
  it('matches the surface form exactly', () => {
    expect(tokenMatchesAnyTerm(inflected, ['押し切られ'])).toBe(true);
    expect(tokenMatchesAnyTerm(inflected, ['押し切る'])).toBe(true); // via lemma
    expect(tokenMatchesAnyTerm(inflected, ['押し切られた'])).toBe(false);
    expect(tokenMatchesAnyTerm(inflected, undefined)).toBe(false);
  });

  it('matches saved forms through lemmas for inflected tokens', () => {
    const saved = new Set(['押し切る', '押し切られる']);
    expect(tokenMatchesAnyForm(inflected, saved)).toBe(true);
    expect(tokenMatchesAnyForm(inflected, new Set(['押し切られた']))).toBe(false);
    expect(tokenMatchesAnyForm(inflected, undefined)).toBe(false);
  });

  it('matches lowercased saved forms (set contract) and exact casing', () => {
    const token = { text: 'Tokyo', lemmas: [{ lemma: 'tokyo' }] };
    expect(tokenMatchesAnyForm(token, new Set(['tokyo']))).toBe(true);
    expect(tokenMatchesAnyForm(token, new Set(['Tokyo']))).toBe(true);
  });
});
