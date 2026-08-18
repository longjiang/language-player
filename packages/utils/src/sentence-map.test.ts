import { describe, expect, it } from 'vitest';
import { buildSentenceMap, segmentSentences, sentenceIndexAt } from './sentence-map';

describe('segmentSentences', () => {
  it('splits on sentence-final punctuation, keeping closers attached', () => {
    const text = 'Hello world. How are you? "Fine!"';
    const ranges = segmentSentences(text);
    expect(ranges.map((r) => r.start)).toEqual([0, 12, 25]);
    expect(text.slice(ranges[0]!.start, ranges[0]!.end)).toBe('Hello world.');
    // Segments start right after the punctuation run, so the inter-sentence
    // space is the next segment's leading char (web behavior).
    expect(text.slice(ranges[1]!.start, ranges[1]!.end)).toBe(' How are you?');
    expect(text.slice(ranges[2]!.start, ranges[2]!.end)).toBe(' "Fine!"');
  });

  it('handles CJK punctuation', () => {
    const text = '今日は暑い。明日はどうだろう？';
    const ranges = segmentSentences(text);
    expect(ranges).toHaveLength(2);
    expect(text.slice(ranges[0]!.start, ranges[0]!.end)).toBe('今日は暑い。');
    expect(text.slice(ranges[1]!.start, ranges[1]!.end)).toBe('明日はどうだろう？');
  });

  it('does not split on decimal points or abbreviations', () => {
    const ranges = segmentSentences('Pi is 3.14. Dr. Smith arrived. No, wait.');
    // "3.14" and "Dr." must not end a sentence.
    expect(ranges).toHaveLength(3);
  });

  it('covers the whole string including a final segment without punctuation', () => {
    const text = 'First sentence. Second without end';
    const ranges = segmentSentences(text);
    expect(ranges).toHaveLength(2);
    expect(text.slice(ranges[1]!.start, ranges[1]!.end)).toBe(' Second without end');
  });
});

describe('buildSentenceMap', () => {
  it('aligns 1:1 when sentence counts match', () => {
    const map = buildSentenceMap('Alpha. Beta.', 'One. Two.');
    expect(map).not.toBeNull();
    expect(map!.pairs).toHaveLength(2);
  });

  it('aligns proportionally when counts differ (LLM merges/splits)', () => {
    const map = buildSentenceMap('Alpha. Beta. Gamma.', 'One. Two.');
    expect(map).not.toBeNull();
    expect(map!.pairs).toHaveLength(3);
    for (const p of map!.pairs) {
      expect(p.tr.start).toBeGreaterThanOrEqual(0);
      expect(p.tr.end).toBeLessThanOrEqual(9);
    }
  });

  it('returns null for empty/parse-failed input', () => {
    expect(buildSentenceMap('', 'X. Y.')).toBeNull();
    expect(buildSentenceMap('A. B.', '')).toBeNull();
  });
});

describe('sentenceIndexAt', () => {
  const text = 'First sentence here. Second sentence there. Third!';
  const map = buildSentenceMap(text, 'Première phrase ici. Deuxième phrase là. Troisième !');

  it('maps a char position to its containing sentence', () => {
    expect(sentenceIndexAt(map!, text.indexOf('Second'))).toBe(1);
    expect(sentenceIndexAt(map!, 0)).toBe(0);
    expect(sentenceIndexAt(map!, text.length - 1)).toBe(2);
  });

  it('returns null for positions outside all sentences', () => {
    expect(sentenceIndexAt(map!, -1)).toBeNull();
    expect(sentenceIndexAt(map!, text.length + 5)).toBeNull();
  });
});
