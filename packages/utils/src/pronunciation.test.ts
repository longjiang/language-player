import { describe, expect, it } from 'vitest';
import { formatPronunciation } from './pronunciation';
import type { DictionaryEntry } from '@langplayer/shared';

function entry(overrides: Partial<DictionaryEntry>): DictionaryEntry {
  return {
    kind: 'dictionary',
    dictionary: { id: 'cc-canto', name: 'CC-Canto', version: '2021' },
    id: 'x',
    match_type: 'exact',
    source: 'cc-canto',
    head: '呢個',
    definitions: ['this'],
    pronunciation: 'ni1 go3',
    ...overrides,
  } as DictionaryEntry;
}

describe('formatPronunciation', () => {
  it('uses jyutping for Cantonese, not Mandarin pinyin', () => {
    const e = entry({
      pronunciation: 'ni1 go3',
      phonetic_detail: { jyutping: 'ni1 go3', pinyin: 'ne5 ge4' },
    });
    expect(formatPronunciation(e, 'yue')).toBe('[ni1 go3]');
  });

  it('keeps tone-marked pinyin for Mandarin', () => {
    const e = entry({
      head: '你好',
      pronunciation: 'nǐ hǎo',
      phonetic_detail: { pinyin: 'nǐ hǎo', pinyin_numeric: 'ni3 hao3' },
    });
    expect(formatPronunciation(e, 'zh')).toBe('[nǐ hǎo]');
  });

  it('falls back to phonetic_detail when the flat field is missing', () => {
    const e = entry({
      pronunciation: '',
      phonetic_detail: { pinyin: 'nǐ hǎo' },
    });
    expect(formatPronunciation(e, 'zh')).toBe('[nǐ hǎo]');
  });
});
