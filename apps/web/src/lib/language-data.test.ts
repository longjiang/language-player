import { describe, it, expect } from 'vitest';
import { glyphLangTag } from './language-data';

describe('glyphLangTag', () => {
  it('keeps unambiguous codes fixed', () => {
    expect(glyphLangTag('ja', false)).toBe('ja');
    expect(glyphLangTag('ja', true)).toBe('ja');
    expect(glyphLangTag('ko', true)).toBe('ko');
    expect(glyphLangTag('zh-Hans', false)).toBe('zh-Hans');
    expect(glyphLangTag('zh-Hans', true)).toBe('zh-Hans');
    expect(glyphLangTag('zh-Hant', false)).toBe('zh-Hant');
    expect(glyphLangTag('zh-Hant', true)).toBe('zh-Hant');
  });

  it('resolves script-less Han codes by the simplified/traditional preference', () => {
    expect(glyphLangTag('zh', false)).toBe('zh-Hans');
    expect(glyphLangTag('zh', true)).toBe('zh-Hant');
    expect(glyphLangTag('yue', false)).toBe('zh-Hans');
    expect(glyphLangTag('yue', true)).toBe('zh-Hant');
    expect(glyphLangTag('lzh', false)).toBe('zh-Hans');
    expect(glyphLangTag('lzh', true)).toBe('zh-Hant');
    expect(glyphLangTag('zh-CN', false)).toBe('zh-Hans');
    expect(glyphLangTag('zh-CN', true)).toBe('zh-Hant');
    expect(glyphLangTag('zh-Hant-TW', false)).toBe('zh-Hant');
    expect(glyphLangTag('nan', false)).toBe('zh-Hans');
    expect(glyphLangTag('nan', true)).toBe('zh-Hant');
  });

  it('passes through non-Han codes unchanged', () => {
    expect(glyphLangTag('en', false)).toBe('en');
    expect(glyphLangTag('ar', false)).toBe('ar');
    expect(glyphLangTag('ru', true)).toBe('ru');
  });
});
