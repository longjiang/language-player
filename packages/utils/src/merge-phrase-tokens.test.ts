import { describe, expect, it } from 'vitest';
import type { LemmatizedToken } from '@langplayer/shared';
import { mergePhraseTokens } from './merge-phrase-tokens';

function tok(text: string): LemmatizedToken {
  return { text, lemmas: [] };
}

function lemmaTok(text: string, lemma: string): LemmatizedToken {
  return { text, lemmas: [{ lemma }] };
}

describe('mergePhraseTokens', () => {
  it('merges a multi-token phrase into one atomic token', () => {
    const tokens = [tok('家賃'), tok('滞納'), tok('する')];
    const out = mergePhraseTokens('家賃滞納する', tokens, ['家賃滞納']);

    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ text: '家賃滞納', lemmas: [{ lemma: '家賃滞納' }] });
    expect(out[1]).toBe(tokens[2]);
  });

  it('preserves whitespace/punctuation inside the phrase', () => {
    const tokens = [tok('Made'), tok(' '), tok('up'), tok(' '), tok('his'), tok(' '), tok('mind')];
    const out = mergePhraseTokens('Made up his mind', tokens, ['made up his mind']);

    expect(out).toHaveLength(1);
    expect(out[0]!.text).toBe('Made up his mind');
  });

  it('merges every occurrence in the text', () => {
    const tokens = [tok('家賃'), tok('滞納'), tok('、'), tok('家賃'), tok('滞納')];
    const out = mergePhraseTokens('家賃滞納、家賃滞納', tokens, ['家賃滞納']);

    expect(out).toHaveLength(3);
    expect(out.map((t) => t.text)).toEqual(['家賃滞納', '、', '家賃滞納']);
  });

  it('leaves single-token forms untouched (keeps lemmas/pronunciation)', () => {
    const token = lemmaTok('逃亡', '逃亡');
    token.pronunciation = 'トーボー';
    const tokens = [token, tok('する')];
    const out = mergePhraseTokens('逃亡する', tokens, ['逃亡']);

    expect(out).toBe(tokens);
  });

  it('resolves overlapping phrases longest-first', () => {
    const tokens = [tok('家賃'), tok('滞納'), tok('する')];
    const out = mergePhraseTokens('家賃滞納する', tokens, ['家賃', '家賃滞納']);

    expect(out).toHaveLength(2);
    expect(out[0]!.text).toBe('家賃滞納');
  });

  it('does not merge a phrase that starts or ends mid-token', () => {
    const tokens = [tok('あい'), tok('あい')];
    const out = mergePhraseTokens('あいあい', tokens, ['いあ']);

    expect(out).toBe(tokens);
  });

  it('matches case-insensitively and keeps the source slice', () => {
    const tokens = [tok('Made'), tok(' '), tok('up')];
    const out = mergePhraseTokens('Made up', tokens, ['MADE UP']);

    expect(out[0]!.text).toBe('Made up');
    expect(out[0]!.lemmas[0]!.lemma).toBe('Made up');
  });

  it('returns the input unchanged when no phrase matches', () => {
    const tokens = [tok('a'), tok('b')];
    expect(mergePhraseTokens('ab', tokens, ['xyz'])).toBe(tokens);
  });

  it('returns the input unchanged when tokens do not reconstruct the text', () => {
    const tokens = [tok('a'), tok('b')];
    expect(mergePhraseTokens('abc', tokens, ['ab'])).toBe(tokens);
  });

  it('returns the input unchanged for empty phrases or empty tokens', () => {
    const tokens = [tok('a'), tok('b')];
    expect(mergePhraseTokens('ab', tokens, [])).toBe(tokens);
    expect(mergePhraseTokens('', [], ['ab'])).toEqual([]);
  });
});
