import { describe, expect, it } from 'vitest';
import {
  formatTagSearchQuery,
  isTagSearchQuery,
  parseTagSearchQuery,
  parseVideoTags,
} from './video-tags';

describe('parseVideoTags', () => {
  it('returns [] for empty input', () => {
    expect(parseVideoTags(undefined)).toEqual([]);
    expect(parseVideoTags(null)).toEqual([]);
    expect(parseVideoTags('')).toEqual([]);
    expect(parseVideoTags(' , , ')).toEqual([]);
  });

  it('splits, trims, and keeps order', () => {
    expect(parseVideoTags('東京, ニュース ,TOKYOMX')).toEqual(['東京', 'ニュース', 'TOKYOMX']);
  });

  it('drops duplicate tags case-insensitively, keeping the first spelling', () => {
    expect(parseVideoTags('YouTube,youtube,YouTuber')).toEqual(['YouTube', 'YouTuber']);
  });
});

describe('tag search queries', () => {
  it('detects a leading # (ignoring surrounding whitespace)', () => {
    expect(isTagSearchQuery('#news')).toBe(true);
    expect(isTagSearchQuery('  #news ')).toBe(true);
    expect(isTagSearchQuery('news')).toBe(false);
    expect(isTagSearchQuery('')).toBe(false);
  });

  it('formats a tag as a search-field value', () => {
    expect(formatTagSearchQuery('news')).toBe('#news');
    expect(formatTagSearchQuery('  東京 ')).toBe('#東京');
  });

  it('strips the leading # and leaves other queries alone', () => {
    expect(parseTagSearchQuery('#news')).toBe('news');
    expect(parseTagSearchQuery('  #ニュース 速報 ')).toBe('ニュース 速報');
    expect(parseTagSearchQuery('news')).toBe('news');
  });
});
