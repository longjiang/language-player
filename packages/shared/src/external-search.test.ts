import { describe, it, expect } from 'vitest';
import {
  buildExternalSearchLinks,
  groupExternalSearchLinks,
  isHanScript,
} from './external-search';

describe('external-search builder (SPEC-094)', () => {
  it('always provides images + Wikipedia + Wiktionary', () => {
    const links = buildExternalSearchLinks({
      term: 'cat',
      l1Code: 'en',
      l2Code: 'en',
      l2Name: 'English',
      l2Han: false,
      l1Han: false,
    });
    const keys = links.map((l) => l.key);
    for (const k of ['google-images', 'wikipedia', 'wiktionary']) {
      expect(keys).toContain(k);
    }
  });

  it('groups under images / reference / dictionaries in spec order', () => {
    const links = buildExternalSearchLinks({
      term: '猫',
      l1Code: 'en',
      l2Code: 'zh',
      l2Name: 'Chinese',
      l2Han: true,
      l1Han: false,
    });
    const groups = groupExternalSearchLinks(links);
    expect(groups.map((g) => g.group)).toEqual(['images', 'reference', 'dictionaries']);
    const first = groups[0]!.links.map((l) => l.key);
    expect(first).toContain('google-images');
    // Han sources appear for Chinese (Baidu Baike, Moedict, ZDIC).
    expect(groups[1]!.links.map((l) => l.key)).toEqual(
      expect.arrayContaining(['baidu-baike', 'moedict']),
    );
    expect(groups[2]!.links.map((l) => l.key)).toEqual(expect.arrayContaining(['zdic']));
  });

  it('adds Japanese dictionaries only for ja', () => {
    const ja = buildExternalSearchLinks({
      term: '猫', l1Code: 'en', l2Code: 'ja', l2Name: 'Japanese', l2Han: false, l1Han: false,
    });
    const jaKeys = ja.map((l) => l.key);
    for (const k of ['jisho', 'weblio', 'jpdb', 'japandict', 'tangorin']) expect(jaKeys).toContain(k);

    const en = buildExternalSearchLinks({
      term: 'cat', l1Code: 'en', l2Code: 'en', l2Name: 'English', l2Han: false, l1Han: false,
    });
    expect(en.map((l) => l.key)).not.toContain('jisho');
  });

  it('filters out inapplicable references for a non-Han, non-en L2', () => {
    const de = buildExternalSearchLinks({
      term: 'Haus', l1Code: 'en', l2Code: 'de', l2Name: 'German', l2Han: false, l1Han: false,
    });
    const keys = de.map((l) => l.key);
    expect(keys).not.toContain('baidu-baike');
    expect(keys).not.toContain('zdic');
    // Usage trends applies for de.
    expect(keys).toContain('usage-trends');
  });

  it('classifies Han scripts', () => {
    expect(isHanScript('zh')).toBe(true);
    expect(isHanScript('yue')).toBe(true);
    expect(isHanScript('ja')).toBe(false);
  });
});
