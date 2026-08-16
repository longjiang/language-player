import { describe, expect, it } from 'vitest';
import { buildRuby } from './furigana';

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

  it('falls back to one word-level segment when counts mismatch', () => {
    expect(buildRuby('不到长城非好汉', 'bú dào cháng chéng fēi hǎo', 'zh')).toEqual([
      { text: '不到长城非好汉', reading: 'bú dào cháng chéng fēi hǎo' },
    ]);
  });
});
