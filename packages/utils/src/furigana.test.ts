import { describe, expect, it } from 'vitest';
import { buildRuby } from './furigana';

describe('buildRuby Japanese per-kanji segmentation', () => {
  it('splits a multi-kanji run into one segment per kanji with the reading distributed', () => {
    // 富士 → ふ/じ, 山 → さん (textbook per-kanji furigana)
    expect(buildRuby('富士山', 'ふじさん', 'ja')).toEqual([
      { text: '富', reading: 'ふ' },
      { text: '士', reading: 'じ' },
      { text: '山', reading: 'さん' },
    ]);
  });

  it('distributes longer readings evenly across the kanji', () => {
    // 象徴 → しょう/ちょう (4 kana over 2 kanji — even 2/2)
    expect(buildRuby('象徴', 'しょうちょう', 'ja')).toEqual([
      { text: '象', reading: 'しょう' },
      { text: '徴', reading: 'ちょう' },
    ]);
  });

  it('keeps kana readings out of kana-only words', () => {
    expect(buildRuby('は', 'は', 'ja')).toEqual([{ text: 'は' }]);
  });

  it('keeps mixed kanji+kana words intact with kana left plain', () => {
    // 食べる → 食/た + べる (kana run stays plain)
    expect(buildRuby('食べる', 'たべる', 'ja')).toEqual([
      { text: '食', reading: 'た' },
      { text: 'べる' },
    ]);
  });

  it('falls back to a word-level segment when the reading has fewer mora than characters', () => {
    expect(buildRuby('明日', 'あ', 'ja')).toEqual([{ text: '明日', reading: 'あ' }]);
  });
});

describe('buildRuby Chinese/Cantonese per-character segmentation', () => {
  it('splits zh pinyin into one segment per hanzi', () => {
    expect(buildRuby('不到长城非好汉', 'bú dào cháng chéng fēi hǎo hàn', 'zh')).toEqual([
      { text: '不', reading: 'bú' },
      { text: '到', reading: 'dào' },
      { text: '长', reading: 'cháng' },
      { text: '城', reading: 'chéng' },
      { text: '非', reading: 'fēi' },
      { text: '好', reading: 'hǎo' },
      { text: '汉', reading: 'hàn' },
    ]);
  });

  it('splits yue jyutping the same way', () => {
    expect(buildRuby('你好', 'nei5 hou2', 'yue')).toEqual([
      { text: '你', reading: 'nei5' },
      { text: '好', reading: 'hou2' },
    ]);
  });

  it('splits lzh (Literary Chinese) pinyin per character like zh', () => {
    expect(buildRuby('酒德颂', 'jiǔ dé sòng', 'lzh')).toEqual([
      { text: '酒', reading: 'jiǔ' },
      { text: '德', reading: 'dé' },
      { text: '颂', reading: 'sòng' },
    ]);
  });

  it('splits cmn (Mandarin) pinyin per character like zh', () => {
    expect(buildRuby('你好世界', 'nǐ hǎo shì jiè', 'cmn')).toEqual([
      { text: '你', reading: 'nǐ' },
      { text: '好', reading: 'hǎo' },
      { text: '世', reading: 'shì' },
      { text: '界', reading: 'jiè' },
    ]);
  });

  it('falls back to one word-level segment when counts mismatch', () => {
    expect(buildRuby('不到长城非好汉', 'bú dào cháng chéng fēi hǎo', 'zh')).toEqual([
      { text: '不到长城非好汉', reading: 'bú dào cháng chéng fēi hǎo' },
    ]);
  });
});
