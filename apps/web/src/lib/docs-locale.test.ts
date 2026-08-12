import { describe, expect, it } from 'vitest';
import { detectBrowserL1, resolveDocsL1 } from './docs-locale';

describe('resolveDocsL1', () => {
  it('prefers a supported ?l1= query', () => {
    expect(resolveDocsL1('ja', 'en-US,en;q=0.9')).toBe('ja');
  });

  it('ignores an unsupported ?l1= query and falls back to the browser', () => {
    expect(resolveDocsL1('xx', 'fr-FR,fr;q=0.9')).toBe('fr');
  });

  it('defaults to the browser language when no query is present', () => {
    expect(resolveDocsL1(undefined, 'de-DE,de;q=0.8')).toBe('de');
  });

  it('maps common Chinese browser locales to UI locales', () => {
    expect(detectBrowserL1('zh-CN,zh;q=0.9')).toBe('zh-Hans');
    expect(detectBrowserL1('zh-TW,zh;q=0.9')).toBe('zh-Hant');
  });

  it('falls back to English when no header is available', () => {
    expect(resolveDocsL1(undefined, null)).toBe('en');
  });
});
