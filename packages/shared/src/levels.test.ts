import { describe, expect, it } from 'vitest';

import { primaryScale, shouldShowLevel } from './levels';

describe('Chinese level scales', () => {
  it('treats Literary Chinese (lzh) like zh', () => {
    expect(primaryScale('lzh')).toBe('hsk_2010');
    expect(primaryScale('zh')).toBe('hsk_2010');
    expect(primaryScale('zh-Hans')).toBe('hsk_2010');
  });

  it('shows only HSK levels for lzh, matching zh', () => {
    expect(shouldShowLevel({ scale: 'hsk_2025' }, 'lzh')).toBe(true);
    expect(shouldShowLevel({ scale: 'hsk_2010' }, 'lzh')).toBe(true);
    expect(shouldShowLevel({ scale: 'cefr' }, 'lzh')).toBe(false);
    expect(shouldShowLevel({ scale: 'cefr' }, 'zh')).toBe(false);
  });

  it('shows all scales for non-Chinese languages', () => {
    expect(shouldShowLevel({ scale: 'cefr' }, 'ja')).toBe(true);
    expect(primaryScale('ja')).toBe('jlpt');
  });
});
