import { describe, expect, it } from 'vitest';
import { blankIdsIn, extractBlankMarkers, extractInlineMarkers, hasBlankMarkers } from './blank-markers';

describe('extractBlankMarkers', () => {
  it('returns the text unchanged when there are no markers', () => {
    const result = extractBlankMarkers('和谐号很好。');
    expect(result.cleanText).toBe('和谐号很好。');
    expect(result.markers).toEqual([]);
  });

  it('strips markers and records their offset in the clean text', () => {
    const result = extractBlankMarkers('复兴号比较{{b1}}，比较{{b2}}。');
    expect(result.cleanText).toBe('复兴号比较，比较。');
    // Offsets land where each marker was removed.
    expect(result.markers).toEqual([
      { id: 'b1', index: 5 },
      { id: 'b2', index: 8 },
    ]);
    // Reconstructing from the offsets must reproduce the clean text length.
    expect(result.cleanText.length).toBe(9);
  });

  it('keeps markers in text order across long passages', () => {
    const text = '全车都有{{b3}}，每个座位都有{{b4}}，很方便。';
    expect(blankIdsIn(text)).toEqual(['b3', 'b4']);
  });

  it('tolerates whitespace inside the braces', () => {
    const result = extractBlankMarkers('比较{{ b1 }}新。');
    expect(result.cleanText).toBe('比较新。');
    expect(result.markers).toEqual([{ id: 'b1', index: 2 }]);
  });

  it('handles a marker at the very start and very end', () => {
    expect(extractBlankMarkers('{{b1}}新{{b2}}').markers).toEqual([
      { id: 'b1', index: 0 },
      { id: 'b2', index: 1 },
    ]);
  });

  it('handles a marker at the end with no trailing text', () => {
    const result = extractBlankMarkers('比较{{b1}}');
    expect(result.cleanText).toBe('比较');
    expect(result.markers).toEqual([{ id: 'b1', index: 2 }]);
  });

  it('does not treat lone braces as markers', () => {
    expect(extractBlankMarkers('用 { 和 } 表示').markers).toEqual([]);
  });

  it('is empty-safe', () => {
    expect(extractBlankMarkers('')).toEqual({ cleanText: '', markers: [] });
  });

  it('detects presence without parsing', () => {
    expect(hasBlankMarkers('比较{{b1}}')).toBe(true);
    expect(hasBlankMarkers('比较')).toBe(false);
  });
});

describe('extractInlineMarkers', () => {
  it('extracts blanks alone', () => {
    const result = extractInlineMarkers('比较{{b1}}。', { blanks: true });
    expect(result.cleanText).toBe('比较。');
    expect(result.blankMarkers).toEqual([{ id: 'b1', index: 2 }]);
    expect(result.noteMarkers).toEqual([]);
  });

  it('keeps note behaviour identical when only notes are requested', () => {
    const result = extractInlineMarkers('酒德颂[1]先生', { notes: true });
    expect(result.cleanText).toBe('酒德颂先生');
    expect(result.noteMarkers).toEqual([{ id: 1, index: 3 }]);
  });

  it('gives both marker kinds offsets valid in the same final text', () => {
    // The note precedes the blank: extracting in sequence would leave the note
    // offset stale once the blank was removed, which is the bug this prevents.
    const result = extractInlineMarkers('酒德颂[1]比较{{b1}}。', { notes: true, blanks: true });
    expect(result.cleanText).toBe('酒德颂比较。');
    expect(result.noteMarkers).toEqual([{ id: 1, index: 3 }]);
    expect(result.blankMarkers).toEqual([{ id: 'b1', index: 5 }]);
  });

  it('leaves an unwanted marker kind in the text verbatim', () => {
    const result = extractInlineMarkers('比较{{b1}}[2]', { blanks: true });
    expect(result.cleanText).toBe('比较[2]');
  });

  it('returns the text untouched when neither kind is requested', () => {
    const result = extractInlineMarkers('比较{{b1}}[2]', {});
    expect(result.cleanText).toBe('比较{{b1}}[2]');
    expect(result.blankMarkers).toEqual([]);
    expect(result.noteMarkers).toEqual([]);
  });
});
