import { describe, it, expect } from 'vitest';
import type { LemmatizedToken } from '@langplayer/shared';
import { mergeAbbreviationSegments, segmentFallback, segmentSentences, sentenceContaining, sentenceForToken } from './sentence';

const token = (text: string): LemmatizedToken => ({ text, lemmas: [] });

describe('segmentSentences', () => {
  it('splits English on sentence terminals', () => {
    const segs = segmentSentences('One. Two! Three?', 'en');
    expect(segs.map(s => s.text.trim())).toEqual(['One.', 'Two!', 'Three?']);
  });

  it('does not merge real short sentences', () => {
    expect(segmentSentences('One. Two. Three.', 'en').map(s => s.text.trim())).toEqual([
      'One.',
      'Two.',
      'Three.',
    ]);
  });

  it('keeps decimals intact', () => {
    const segs = segmentSentences('The value of pi is 3.14159. That is all.', 'en');
    expect(segs.map(s => s.text.trim())).toEqual([
      'The value of pi is 3.14159.',
      'That is all.',
    ]);
  });

  it('keeps closing quotes with their sentence', () => {
    const segs = segmentSentences('“Hello,” she said. “Hi,” he replied.', 'en');
    expect(segs.map(s => s.text.trim())).toEqual([
      '“Hello,” she said.',
      '“Hi,” he replied.',
    ]);
  });

  it('keeps short Latin abbreviations with their sentence', () => {
    const segs = segmentSentences('Dr. Smith lives here. He is a doctor.', 'en');
    expect(segs.map(s => s.text.trim())).toEqual([
      'Dr. Smith lives here.',
      'He is a doctor.',
    ]);
  });

  it('splits Chinese and Japanese', () => {
    expect(segmentSentences('他去了商店。然后回家了。', 'zh').map(s => s.text)).toEqual([
      '他去了商店。',
      '然后回家了。',
    ]);
    expect(segmentSentences('吾輩は猫である。名前はたぬき。', 'ja').map(s => s.text)).toEqual([
      '吾輩は猫である。',
      '名前はたぬき。',
    ]);
  });

  it('returns the whole text when there is no terminal punctuation', () => {
    const segs = segmentSentences('No punctuation here at all', 'en');
    expect(segs.map(s => s.text.trim())).toEqual(['No punctuation here at all']);
  });

  it('reports offsets that slice back to the segments', () => {
    const text = 'One. Two. Three.';
    for (const s of segmentSentences(text, 'en')) {
      expect(text.slice(s.start, s.end)).toBe(s.text);
    }
  });
});

// segmentFallback is the Hermes path (no Intl.Segmenter) — Node tests must
// exercise it directly, since the native Segmenter never falls back here.
describe('segmentFallback (Hermes / no Intl.Segmenter)', () => {
  it('splits Japanese sentences with NO inter-sentence whitespace', () => {
    const text =
      '彼はその音楽を聴きながら、文字を打ち込んでいった。朝の早い時刻にヤナーチェックを聴いた。';
    expect(segmentFallback(text).map(s => s.text)).toEqual([
      '彼はその音楽を聴きながら、文字を打ち込んでいった。',
      '朝の早い時刻にヤナーチェックを聴いた。',
    ]);
  });

  it('splits Chinese without whitespace', () => {
    expect(segmentFallback('他去了商店。然后回家了。').map(s => s.text)).toEqual([
      '他去了商店。',
      '然后回家了。',
    ]);
  });

  it('keeps closing quotes/brackets with their CJK sentence', () => {
    expect(segmentFallback('「こんにちは。」次に進む。').map(s => s.text)).toEqual([
      '「こんにちは。」',
      '次に進む。',
    ]);
  });

  it('still requires whitespace after Latin terminals', () => {
    // Abbreviation merging is applied upstream in segmentSentences.
    expect(mergeAbbreviationSegments(segmentFallback('Dr. Smith lives here. He is a doctor.')).map(s => s.text.trim())).toEqual([
      'Dr. Smith lives here.',
      'He is a doctor.',
    ]);
    expect(segmentFallback('Pi is 3.14159. That is all.').map(s => s.text.trim())).toEqual([
      'Pi is 3.14159.',
      'That is all.',
    ]);
  });
});

describe('sentenceContaining', () => {
  it('returns the sentence at the given offset', () => {
    const text = 'First sentence here. Second sentence there.';
    expect(sentenceContaining(text, 3, 'en')).toBe('First sentence here.');
    expect(sentenceContaining(text, 24, 'en')).toBe('Second sentence there.');
  });

  it('falls back to the full text for out-of-range offsets', () => {
    expect(sentenceContaining('Hi.', -1, 'en')).toBe('Hi.');
    expect(sentenceContaining('Hi.', 99, 'en')).toBe('Hi.');
  });
});

describe('sentenceForToken', () => {
  it('returns the sentence containing the clicked token', () => {
    const tokens = ['Hello', ' ', 'world', '.', ' ', 'Next', '.'].map(token);
    const text = tokens.map(t => t.text).join('');
    expect(sentenceForToken(text, tokens, tokens[2]!, 'en')).toBe('Hello world.');
    expect(sentenceForToken(text, tokens, tokens[5]!, 'en')).toBe('Next.');
  });

  it('falls back to substring search when tokens do not reconstruct the text', () => {
    const text = 'First sentence here. Second sentence there.';
    const tokens = [token('First'), token('sentence'), token('here.'), token('Second')];
    expect(sentenceForToken(text, tokens, tokens[0]!, 'en')).toBe('First sentence here.');
    expect(sentenceForToken(text, tokens, tokens[3]!, 'en')).toBe('Second sentence there.');
  });
});
