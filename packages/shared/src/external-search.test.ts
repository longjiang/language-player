import { describe, it, expect } from 'vitest';
import {
  buildExternalSearchLinks,
  buildImageSearchUrls,
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
    for (const k of ['bing-images', 'google-images', 'wikipedia', 'wiktionary']) {
      expect(keys).toContain(k);
    }
  });

  it('links Wikipedia to the L2 edition, not the L1 (SPEC-094)', () => {
    const links = buildExternalSearchLinks({
      term: 'chat',
      l1Code: 'en',
      l2Code: 'fr',
      l2Name: 'French',
      l2Han: false,
      l1Han: false,
    });
    expect(links.find((l) => l.key === 'wikipedia')!.url).toBe(
      'https://fr.m.wikipedia.org/w/index.php?search=chat',
    );
  });

  it('maps L2 Wikipedia subdomain overrides and falls back for unknown editions', () => {
    const cmn = buildExternalSearchLinks({
      term: 'hao', l1Code: 'en', l2Code: 'cmn', l2Name: 'Mandarin', l2Han: true, l1Han: false,
    });
    expect(cmn.find((l) => l.key === 'wikipedia')!.url).toBe(
      'https://zh.m.wikipedia.org/w/index.php?search=hao',
    );

    const nb = buildExternalSearchLinks({
      term: 'hus', l1Code: 'en', l2Code: 'nb', l2Name: 'Norwegian Bokmål', l2Han: false, l1Han: false,
    });
    expect(nb.find((l) => l.key === 'wikipedia')!.url).toBe(
      'https://no.m.wikipedia.org/w/index.php?search=hus',
    );

    // Codes outside the live-edition allowlist fall back to the raw L2 code.
    const grc = buildExternalSearchLinks({
      term: 'logos', l1Code: 'en', l2Code: 'grc', l2Name: 'Ancient Greek', l2Han: false, l1Han: false,
    });
    expect(grc.find((l) => l.key === 'wikipedia')!.url).toBe(
      'https://grc.m.wikipedia.org/w/index.php?search=logos',
    );
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
    expect(first).toContain('bing-images');
    // Google Images is offered again beside Bing (ADR-0046's 2026-10-05
    // amendment); Bing stays first so the China-safe engine is the default.
    expect(first).toEqual(['bing-images', 'google-images']);
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
    // Google Ngrams is gone for every language: books.google.com is blocked in
    // mainland China and it had no non-Google equivalent (ADR-0046).
    expect(keys).not.toContain('usage-trends');
  });

  it('classifies Han scripts', () => {
    expect(isHanScript('zh')).toBe(true);
    expect(isHanScript('yue')).toBe(true);
    expect(isHanScript('ja')).toBe(false);
  });
});

describe('language-scoped image-search URLs (SPEC-094)', () => {
  // The whole point: "pies" is pastry in English, feet in Spanish and a dog in
  // Polish, so the same term must not produce the same URL for every language.
  it('builds a distinct, language-scoped URL per engine', () => {
    const en = buildImageSearchUrls('pies', 'en');
    const es = buildImageSearchUrls('pies', 'es');
    const pl = buildImageSearchUrls('pies', 'pl');

    expect(en.bing).toBe(
      'https://www.bing.com/images/search?q=pies&mkt=en-US&setlang=en',
    );
    expect(es.bing).toBe(
      'https://www.bing.com/images/search?q=pies&mkt=es-ES&setlang=es',
    );
    expect(pl.bing).toBe(
      'https://www.bing.com/images/search?q=pies&mkt=pl-PL&setlang=pl',
    );

    // Google Images rides the current `udm=2` vertical (`tbm=isch` 302s to it),
    // scoped by interface language + result-language restrict.
    expect(en.google).toBe(
      'https://www.google.com/search?q=pies&udm=2&hl=en&lr=lang_en',
    );
    expect(es.google).toBe(
      'https://www.google.com/search?q=pies&udm=2&hl=es&lr=lang_es',
    );

    // No two languages share a URL.
    expect(new Set([en.bing, es.bing, pl.bing]).size).toBe(3);
  });

  it('emits no fabricated market for a language Bing does not publish one for', () => {
    const { bing } = buildImageSearchUrls('logos', 'grc');
    expect(bing).toBe(
      'https://www.bing.com/images/search?q=logos&setlang=grc',
    );
    expect(bing).not.toContain('mkt=');
  });

  it('maps Han languages to the Chinese market and Google language form', () => {
    // `yue` is a documented Bing market of its own…
    expect(buildImageSearchUrls('貓', 'yue').bing).toContain('mkt=zh-HK');
    // …but Google files Cantonese under Chinese, so `lr` uses `zh-CN` rather
    // than a `lang_yue` value Google does not list.
    expect(buildImageSearchUrls('貓', 'yue').google).toContain('lr=lang_zh-CN');
    // Other Han codes fall back to the Chinese market.
    expect(buildImageSearchUrls('食', 'nan').bing).toContain('mkt=zh-CN');
    expect(buildImageSearchUrls('猫', 'zh').bing).toContain('mkt=zh-CN');
  });

  it('URL-encodes the term in both engines', () => {
    const { bing, google } = buildImageSearchUrls('pies & feet', 'es');
    expect(bing).toContain('q=pies%20%26%20feet');
    expect(google).toContain('q=pies%20%26%20feet');
  });
});
