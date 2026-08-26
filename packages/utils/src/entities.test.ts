import { describe, it, expect } from 'vitest';
import { decodeHtmlEntities } from './entities';

describe('decodeHtmlEntities', () => {
  it('decodes single-encoded entities', () => {
    expect(decodeHtmlEntities("don&#39;t")).toBe("don't");
    expect(decodeHtmlEntities('fish &amp; chips')).toBe('fish & chips');
    expect(decodeHtmlEntities('&quot;hi&quot;')).toBe('"hi"');
    expect(decodeHtmlEntities('a &lt; b &gt; c')).toBe('a < b > c');
  });

  it('decodes double-encoded entities (YouTube timedtext)', () => {
    // One pass turns &amp;#39; into &#39;, a second turns it into '.
    expect(decodeHtmlEntities('don&amp;#39;t')).toBe("don't");
    expect(decodeHtmlEntities('Tom &amp;amp; Jerry')).toBe('Tom & Jerry');
  });

  it('decodes hex and named references', () => {
    expect(decodeHtmlEntities('&#x27;')).toBe("'");
    expect(decodeHtmlEntities('&apos;')).toBe("'");
    expect(decodeHtmlEntities('&ndash;&mdash;')).toBe('\u2013\u2014');
  });

  it('leaves literal ampersands untouched', () => {
    expect(decodeHtmlEntities('A & B')).toBe('A & B');
    expect(decodeHtmlEntities('AT&T')).toBe('AT&T');
    expect(decodeHtmlEntities('R&D')).toBe('R&D');
  });

  it('does not decode a bare ampersand with no semicolon', () => {
    expect(decodeHtmlEntities('use &lt for less-than')).toBe('use &lt for less-than');
  });

  it('handles unknown named entities by leaving them as-is', () => {
    expect(decodeHtmlEntities('&notreal;')).toBe('&notreal;');
  });

  it('returns empty string for nullish input', () => {
    expect(decodeHtmlEntities('')).toBe('');
    expect(decodeHtmlEntities(undefined as unknown as string)).toBe('');
    expect(decodeHtmlEntities(null as unknown as string)).toBe('');
  });

  it('decodes CJK-visible punctuation entities', () => {
    expect(decodeHtmlEntities('&#12298;abc&#12299;')).toBe('《abc》');
  });
});
