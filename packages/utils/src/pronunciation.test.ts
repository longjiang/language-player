import { describe, expect, it } from 'vitest';
import { cleanPronunciation, formatPronunciation } from './pronunciation';
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

  it('strips wiki.local source labels from displayed pronunciation', () => {
    const e = entry({
      head: 'จาก',
      pronunciation: 't͡ɕaːk̚˨˩, wiki.local',
    });
    expect(formatPronunciation(e, 'th')).toBe('[t͡ɕaːk̚˨˩]');
    expect(cleanPronunciation('t͡ɕon˧, wiki.local')).toBe('t͡ɕon˧');
    expect(cleanPronunciation('pʰim˧')).toBe('pʰim˧');
    expect(cleanPronunciation('')).toBeNull();
  });

  it('prefers Thai Paiboon+ romanization over IPA', () => {
    const e = entry({
      head: 'ประเทศ',
      pronunciation: 'bprà-têet',
      phonetic_detail: {
        ipa: 'pra˨˩.tʰeːt̚˥˩',
        romanization: 'bprà-têet',
      },
    });
    expect(formatPronunciation(e, 'th')).toBe('[bprà-têet]');
  });

  it('strips Wiktionary grammatical labels from Thai pronunciation', () => {
    const e = entry({
      head: 'ประเทศ',
      pronunciation: 'bound form, pra˨˩.tʰeːt̚˥˩, pra˨˩.tʰeːt̚˥˩.sa˨˩.',
    });
    expect(cleanPronunciation(e.pronunciation)).toBe(
      'pra˨˩.tʰeːt̚˥˩, pra˨˩.tʰeːt̚˥˩.sa˨˩',
    );
    expect(cleanPronunciation('bound form, wiktionary')).toBe('wiktionary');
  });
});
