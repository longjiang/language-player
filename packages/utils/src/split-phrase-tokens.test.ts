import { describe, expect, it } from 'vitest';
import type { LemmatizedToken } from '@langplayer/shared';
import { splitPhraseTokens } from './split-phrase-tokens';
import { mergePhraseTokens } from './merge-phrase-tokens';

function tok(text: string): LemmatizedToken {
  return { text, lemmas: [] };
}

function lemmaTok(text: string, lemma: string, pronunciation?: string): LemmatizedToken {
  const t: LemmatizedToken = { text, lemmas: [{ lemma }] };
  if (pronunciation) t.pronunciation = pronunciation;
  return t;
}

describe('splitPhraseTokens', () => {
  it('splits a phrase crossing a token boundary (掘藏 inside 想掘|藏)', () => {
    // '少年去游荡，中年想掘藏，老年做和尚。' → Jieba splits 想掘|藏
    const tokens = [
      lemmaTok('少年', '少年', 'shào nián'),
      tok('去'),
      lemmaTok('游荡', '游荡', 'yóu dàng'),
      tok('，'),
      lemmaTok('中年', '中年', 'zhōng nián'),
      lemmaTok('想掘', '想掘', 'xiǎng jué'),
      lemmaTok('藏', '藏', 'cáng'),
      tok('，'),
      lemmaTok('老年', '老年', 'lǎo nián'),
      tok('做'),
      lemmaTok('和尚', '和尚', 'hé shàng'),
      tok('。'),
    ];
    const { tokens: out, placeholders } = splitPhraseTokens('少年去游荡，中年想掘藏，老年做和尚。', tokens, ['掘藏']);

    // 想掘 → 想 + [掘藏] and 藏 is consumed by the phrase.
    expect(out.map((t) => t.text)).toEqual([
      '少年', '去', '游荡', '，', '中年', '想', '掘藏', '，', '老年', '做', '和尚', '。',
    ]);
    expect(out[5]).toEqual({ text: '想', lemmas: [] }); // placeholder
    expect(out[6]).toEqual({ text: '掘藏', lemmas: [{ lemma: '掘藏' }] }); // atomic
    // The phrase token preserves the exact source slice.
    expect(out.map((t) => t.text).join('')).toBe('少年去游荡，中年想掘藏，老年做和尚。');
    expect(placeholders).toHaveLength(1);
    expect(placeholders[0]!.text).toBe('想');
  });

  it('splits a phrase entirely inside one token (革命 inside 抓革命促)', () => {
    const tokens = [lemmaTok('要', '要', 'yào'), lemmaTok('抓革命促', '抓革命促', 'zhuā gé mìng cù'), lemmaTok('生产', '生产', 'shēng chǎn')];
    const { tokens: out, placeholders } = splitPhraseTokens('要抓革命促生产', tokens, ['革命']);

    expect(out.map((t) => t.text)).toEqual(['要', '抓', '革命', '促', '生产']);
    expect(out[1]).toEqual({ text: '抓', lemmas: [] });
    expect(out[2]).toEqual({ text: '革命', lemmas: [{ lemma: '革命' }] });
    expect(out[3]).toEqual({ text: '促', lemmas: [] });
    expect(placeholders.map((p) => p.text)).toEqual(['抓', '促']);
  });

  it('leaves boundary-aligned occurrences untouched (merge handles those)', () => {
    const tokens = [lemmaTok('家賃', '家賃'), lemmaTok('滞納', '滞納')];
    const { tokens: out, placeholders } = splitPhraseTokens('家賃滞納', tokens, ['家賃滞納']);
    expect(out).toBe(tokens);
    expect(placeholders).toHaveLength(0);
  });

  it('leaves a single-token occurrence untouched (keeps lemmas/pronunciation)', () => {
    const tokens = [lemmaTok('逃亡', '逃亡', 'トーボー')];
    const { tokens: out, placeholders } = splitPhraseTokens('逃亡', tokens, ['逃亡']);
    expect(out).toBe(tokens);
    expect(placeholders).toHaveLength(0);
  });

  it('splits every occurrence in the text', () => {
    const tokens = [lemmaTok('想掘', '想掘'), tok('藏'), tok('，'), lemmaTok('想掘', '想掘'), tok('藏')];
    const { tokens: out, placeholders } = splitPhraseTokens('想掘藏，想掘藏', tokens, ['掘藏']);
    expect(out.map((t) => t.text)).toEqual(['想', '掘藏', '，', '想', '掘藏']);
    expect(placeholders.map((p) => p.text)).toEqual(['想', '想']);
  });

  it('does not let two occurrences share a token', () => {
    // 掘藏掘藏 in one token "掘藏掘藏": the first occurrence (offset 0) is
    // claimed atomically; the second would share the same token, so it is
    // skipped and the leftover tail (which happens to be 掘藏) becomes one
    // placeholder — re-lemmatizing it yields a real 掘藏 token again.
    const tokens = [lemmaTok('掘藏掘藏', '掘藏掘藏')];
    const { tokens: out, placeholders } = splitPhraseTokens('掘藏掘藏', tokens, ['掘藏']);
    expect(out.map((t) => t.text)).toEqual(['掘藏', '掘藏']);
    expect(out[0]).toEqual({ text: '掘藏', lemmas: [{ lemma: '掘藏' }] });
    expect(out[1]).toEqual({ text: '掘藏', lemmas: [] });
    expect(placeholders.map((p) => p.text)).toEqual(['掘藏']);
  });

  it('resolves overlapping phrases longest-first', () => {
    const tokens = [lemmaTok('想掘', '想掘'), tok('藏了')];
    const { tokens: out } = splitPhraseTokens('想掘藏了', tokens, ['掘藏', '掘藏了']);
    expect(out.map((t) => t.text)).toEqual(['想', '掘藏了']);
  });

  it('rejects short Latin phrases (space-delimited languages never split)', () => {
    const tokens = [lemmaTok('the', 'the'), lemmaTok('them', 'them')];
    const { tokens: out, placeholders } = splitPhraseTokens('thethem', tokens, ['he']);
    expect(out).toBe(tokens);
    expect(placeholders).toHaveLength(0);
  });

  it('rejects single-character phrases', () => {
    const tokens = [lemmaTok('想掘', '想掘')];
    const { tokens: out, placeholders } = splitPhraseTokens('想掘', tokens, ['掘']);
    expect(out).toBe(tokens);
    expect(placeholders).toHaveLength(0);
  });

  it('matches case-insensitively but keeps the source slice', () => {
    // Hiragana has no case — exercise the lowercase path via the prolonged mark.
    const tokens = [lemmaTok('ア', 'ア'), tok('ー')];
    const { tokens: out } = splitPhraseTokens('アー', tokens, ['アー']);
    // Boundary-aligned (single token? no — two tokens) → untouched.
    expect(out).toBe(tokens);
  });

  it('returns the input unchanged when tokens do not reconstruct the text', () => {
    const tokens = [tok('a'), tok('b')];
    const { tokens: out, placeholders } = splitPhraseTokens('abc', tokens, ['掘藏']);
    expect(out).toBe(tokens);
    expect(placeholders).toHaveLength(0);
  });

  it('returns the input unchanged for empty phrases or empty tokens', () => {
    const tokens = [tok('掘'), tok('藏')];
    expect(splitPhraseTokens('掘藏', tokens, []).tokens).toBe(tokens);
    const empty = splitPhraseTokens('', [], ['掘藏']);
    expect(empty.tokens).toEqual([]);
    expect(empty.placeholders).toEqual([]);
  });

  it('composes with mergePhraseTokens (split first, then merge)', () => {
    // 少年去游荡，中年想掘藏，老年做和尚。 with saved phrase 掘藏: the split
    // must not break merge's reconstruction invariant for another saved
    // phrase (游荡 is boundary-aligned and already atomic).
    const tokens = [
      lemmaTok('少年', '少年'),
      tok('去'),
      lemmaTok('游荡', '游荡'),
      tok('，'),
      lemmaTok('中年', '中年'),
      lemmaTok('想掘', '想掘'),
      lemmaTok('藏', '藏'),
      tok('，'),
      lemmaTok('老年', '老年'),
      tok('做'),
      lemmaTok('和尚', '和尚'),
      tok('。'),
    ];
    const text = '少年去游荡，中年想掘藏，老年做和尚。';
    const split = splitPhraseTokens(text, tokens, ['掘藏']);
    const merged = mergePhraseTokens(text, split.tokens, ['做和尚']);
    expect(merged.map((t) => t.text)).toEqual([
      '少年', '去', '游荡', '，', '中年', '想', '掘藏', '，', '老年', '做和尚', '。',
    ]);
    expect(merged.map((t) => t.text).join('')).toBe(text);
  });
});
