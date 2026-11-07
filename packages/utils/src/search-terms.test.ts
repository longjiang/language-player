import { describe, expect, it } from 'vitest';
import {
  buildFormSearchTerms,
  entryKanaForm,
  inflectionEndpoint,
  minimalSearchTerms,
  reduceSearchTerms,
  writtenFormVariants,
  type WrittenFormEntry,
} from './search-terms';

describe('writtenFormVariants', () => {
  it('keeps head and alternate script for Chinese (simplified + traditional)', () => {
    const variants = writtenFormVariants(
      {
        head: '说',
        alternate: '說',
        han_script: { simplified: '说', traditional: '說' },
        // Real entries carry richer phonetic_detail (pinyin, ipa, …) — the
        // builder must ignore all of it.
        phonetic_detail: { pinyin: 'shuō' } as WrittenFormEntry['phonetic_detail'],
      } as WrittenFormEntry,
      'zh-Hans',
    );
    expect(variants).toEqual(['说', '說']);
  });

  it('includes the kana reading for Japanese but never romaji/IPA', () => {
    const variants = writtenFormVariants(
      {
        head: '食べる',
        alternate: 'たべる',
        han_script: { kanji: '食べる' },
        phonetic_detail: { kana: 'たべる', romaji: 'taberu' } as WrittenFormEntry['phonetic_detail'],
      } as WrittenFormEntry,
      'ja',
    );
    expect(variants).toEqual(['食べる', 'たべる']);
  });

  it('never includes pronunciation/phonetic guides for Latin-script languages', () => {
    const variants = writtenFormVariants(
      {
        head: 'spout',
        phonetic_detail: { ipa: 'spaʊt, spʌʊt', romanization: 'spout' } as WrittenFormEntry['phonetic_detail'],
      } as WrittenFormEntry,
      'en',
    );
    expect(variants).toEqual(['spout']);
  });
});

describe('minimalSearchTerms', () => {
  it('drops terms contained in another term', () => {
    expect(minimalSearchTerms(['running', 'run', 'runs'])).toEqual(['run']);
    expect(minimalSearchTerms(['吃饭', '吃', 'chīfàn'])).toEqual(['吃', 'chīfàn']);
  });
});

describe('reduceSearchTerms', () => {
  it('searches the exact head and drops forms it already captures', () => {
    expect(
      reduceSearchTerms('run', { inflected: ['runs', 'running', 'ran'] }),
    ).toEqual(['run', 'ran']);
    expect(reduceSearchTerms('walk', { inflected: ['walks', 'walking', 'walked'] })).toEqual([
      'walk',
    ]);
  });

  it('never shortens the head to a looser common part (e.g. "ma" from "make")', () => {
    expect(
      reduceSearchTerms('make', { inflected: ['makes', 'making', 'made'] }),
    ).toEqual(['make', 'making', 'made']);
  });

  it('keeps individual forms when the head cannot capture them', () => {
    expect(
      reduceSearchTerms('行く', { inflected: ['行った', '行って'] }),
    ).toEqual(['行く', '行った', '行って']);
    // 食べる/食べた/食べて share only 食べ — too broad — so all three stay.
    expect(
      reduceSearchTerms('食べる', { inflected: ['食べた', '食べて'] }),
    ).toEqual(['食べる', '食べた', '食べて']);
  });

  it('keeps written variants alongside the head and forms', () => {
    expect(
      reduceSearchTerms('食べる', {
        variants: ['たべる'],
        inflected: ['食べた', '食べて'],
      }),
    ).toEqual(['食べる', '食べた', '食べて', 'たべる']);
  });

  it('returns the head alone when there are no inflected forms', () => {
    expect(reduceSearchTerms('spout')).toEqual(['spout']);
  });
});

describe('entryKanaForm', () => {
  it('returns the kana reading for Japanese', () => {
    expect(
      entryKanaForm({ head: '食べる', phonetic_detail: { kana: 'たべる' } }, 'ja'),
    ).toBe('たべる');
    expect(entryKanaForm({ head: '食べる', phonetic_detail: { kana: 'たべる' } }, 'ja-JP')).toBe(
      'たべる',
    );
  });

  it('returns null for non-Japanese, missing kana, or head already in kana', () => {
    expect(
      entryKanaForm({ head: '食べる', phonetic_detail: { kana: 'たべる' } }, 'zh'),
    ).toBeNull();
    expect(entryKanaForm({ head: '食べる' }, 'ja')).toBeNull();
    expect(
      entryKanaForm({ head: 'たべる', phonetic_detail: { kana: 'たべる' } }, 'ja'),
    ).toBeNull();
  });
});

describe('inflectionEndpoint', () => {
  it('maps languages to their endpoint and matches regional codes', () => {
    expect(inflectionEndpoint('ja')).toBe('/inflect-japanese');
    expect(inflectionEndpoint('en-US')).toBe('/inflect-pattern');
    expect(inflectionEndpoint('zh')).toBeNull();
  });
});

describe('buildFormSearchTerms', () => {
  const allTerms = ['食べる', '食べた', '食べて', 'たべる'];
  const groups = { head: '食べる', kana: 'たべる', inflected: ['食べた', '食べて'] };

  it('returns all terms for an empty selection (All forms)', () => {
    expect(buildFormSearchTerms(allTerms, groups, [])).toEqual(allTerms);
  });

  it('searches only the head when only the lemma is selected', () => {
    expect(buildFormSearchTerms(allTerms, groups, ['head'])).toEqual(['食べる']);
  });

  it('searches only the kana form when selected', () => {
    expect(buildFormSearchTerms(allTerms, groups, ['kana'])).toEqual(['たべる']);
  });

  it('searches conjugations without forcing the lemma in', () => {
    expect(buildFormSearchTerms(allTerms, groups, ['inflected'])).toEqual([
      '食べた',
      '食べて',
    ]);
  });

  it('prunes redundant forms in a multi-group union but keeps the head', () => {
    expect(
      buildFormSearchTerms(
        ['run', 'runs', 'running', 'ran'],
        { head: 'run', inflected: ['runs', 'running', 'ran'] },
        ['head', 'inflected'],
      ),
    ).toEqual(['run', 'ran']);
  });

  it('falls back to the head when the selected group has no terms', () => {
    expect(buildFormSearchTerms(['spout'], { head: 'spout' }, ['inflected'])).toEqual([
      'spout',
    ]);
  });
});
