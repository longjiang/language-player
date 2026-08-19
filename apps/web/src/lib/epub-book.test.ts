import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import JSZip from 'jszip';
import {
  findSpineIndex,
  fullTocHref,
  imageArchiveKey,
  normalizeLanguageCode,
  resolveNavDir,
  resolveLinkHref,
  resolvePath,
  splitFragment,
} from './epub-book';
import type { EpubSpineItem } from './epub-book-types';

function dirname(p: string): string {
  const i = p.lastIndexOf('/');
  return i === -1 ? '' : p.slice(0, i);
}

function attr(s: string | undefined, name: string): string | undefined {
  if (!s) return undefined;
  const m = s.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i')) ??
    s.match(new RegExp(`${name}\\s*=\\s*'([^']*)'`, 'i'));
  return m?.[1];
}

describe('resolvePath (canonical href resolution)', () => {
  it('resolves relative hrefs against a base directory', () => {
    expect(resolvePath('OEBPS', 'Text/ch1.xhtml')).toBe('OEBPS/Text/ch1.xhtml');
    expect(resolvePath('OEBPS', './Text/ch1.xhtml')).toBe('OEBPS/Text/ch1.xhtml');
    expect(resolvePath('OEBPS/Text', '../Images/x.jpg')).toBe('OEBPS/Images/x.jpg');
    expect(resolvePath('', 'ch1.xhtml')).toBe('ch1.xhtml');
  });

  it('keeps fragments out of the path and strips leading slashes', () => {
    expect(splitFragment('Text/p1.xhtml#ch2').path).toBe('Text/p1.xhtml');
    expect(splitFragment('Text/p1.xhtml#ch2').fragment).toBe('ch2');
    expect(resolvePath('OEBPS', '/Text/ch1.xhtml')).toBe('OEBPS/Text/ch1.xhtml');
  });

  it('passes external URLs through untouched', () => {
    expect(resolvePath('OEBPS', 'https://example.com/x')).toBe('https://example.com/x');
  });
});

describe('resolveLinkHref (in-content link canonicalization)', () => {
  it('keeps the fragment of a relative link', () => {
    expect(resolveLinkHref('OEBPS/html/frontm1.html', 'frontm1.html#fw01en01'))
      .toBe('OEBPS/html/frontm1.html#fw01en01');
    expect(resolveLinkHref('OEBPS/html/chapter01.html', 'notesch1.html#ch01en01'))
      .toBe('OEBPS/html/notesch1.html#ch01en01');
  });

  it('resolves same-document and fragment-less links', () => {
    expect(resolveLinkHref('OEBPS/html/chapter01.html', '#ich01en01'))
      .toBe('OEBPS/html/chapter01.html#ich01en01');
    expect(resolveLinkHref('OEBPS/html/chapter01.html', 'chapter02.html'))
      .toBe('OEBPS/html/chapter02.html');
  });
});

describe('imageArchiveKey (inline image resolution)', () => {
  it('resolves a src relative to the spine document, keeping the OPF directory', () => {
    // 1Q84-style nested book: OPF at OPS/package.opf, content at
    // OPS/xhtml/0001.xhtml referencing ../images/0002.jpg.
    expect(imageArchiveKey('OPS/xhtml/0001.xhtml', '../images/0002.jpg'))
      .toBe('/OPS/images/0002.jpg');
    expect(imageArchiveKey('OPS/xhtml/0001.xhtml', 'images/0002.jpg'))
      .toBe('/OPS/xhtml/images/0002.jpg');
    expect(imageArchiveKey('text/part0001.html', '../images/00001.jpeg'))
      .toBe('/images/00001.jpeg');
  });

  it('leaves absolute srcs untouched', () => {
    expect(imageArchiveKey('OPS/xhtml/1.xhtml', 'data:image/png;base64,AAA')).toBeNull();
    expect(imageArchiveKey('OPS/xhtml/1.xhtml', 'https://example.com/a.jpg')).toBeNull();
    expect(imageArchiveKey('OPS/xhtml/1.xhtml', 'blob:abc')).toBeNull();
  });

  it('every <img>/<image> src in real books resolves to a real zip entry', async () => {
    const files = [
      'tmp/testing-assets/epub/ja/2009 村上春樹 - 1Q84 BOOK2.epub',
      'tmp/testing-assets/epub/ja/2016 村田沙耶香 - コンビニ人間.epub',
    ];
    for (const file of files) {
      const zip = await JSZip.loadAsync(readFileSync(file));
      const container = await zip.file('META-INF/container.xml')!.async('text');
      const opfPath = attr(container, 'full-path')!;
      const opfDir = dirname(opfPath);
      const opf = await zip.file(opfPath)!.async('text');
      const manifest = new Map<string, string>();
      for (const m of opf.matchAll(/<item\b([^>]*?)\/?>/gi)) {
        const id = attr(m[1], 'id');
        const href = attr(m[1], 'href');
        if (id && href) manifest.set(id, href);
      }
      const spineMatch = opf.match(/<spine\b[^>]*>([\s\S]*?)<\/spine>/i);
      const spineRaw: string[] = [];
      for (const m of (spineMatch?.[1] ?? '').matchAll(/<itemref\b([^>]*?)\/?>/gi)) {
        const item = manifest.get(attr(m[1], 'idref') ?? '');
        if (item) spineRaw.push(item);
      }

      let imageCount = 0;
      for (const rawHref of spineRaw) {
        const canonical = resolvePath(opfDir, rawHref);
        const doc = await zip.file(canonical)?.async('text');
        if (!doc) continue;
        const srcs = [
          ...[...doc.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/gi)].map(m => m[1]!),
          ...[...doc.matchAll(/<image\b[^>]*\bxlink:href="([^"]+)"/gi)].map(m => m[1]!),
        ];
        for (const src of srcs) {
          const key = imageArchiveKey(canonical, src);
          expect(key, `${file} ${canonical} img src="${src}"`).not.toBeNull();
          const entry = key ? zip.file(key.slice(1)) : null;
          expect(entry, `${file} ${canonical} img src="${src}" → key=${key}`).toBeTruthy();
          imageCount += 1;
        }
      }
      expect(imageCount).toBeGreaterThan(0);
    }
  });
});

describe('resolveNavDir (nav/NCX directory canonicalization)', () => {
  it('resolves raw OPF-relative nav hrefs against the OPF directory', () => {
    // EPUB 2 book: OPF at OEBPS/content.opf, NCX at OEBPS/toc.ncx — epubjs
    // reports ncxPath as "toc.ncx", so the nav dir must become "OEBPS" or
    // every TOC href ("text00002.html") fails to match a spine
    // ("OEBPS/text00002.html").
    expect(resolveNavDir('OEBPS', 'toc.ncx')).toBe('OEBPS');
    expect(resolveNavDir('OEBPS', 'nav.xhtml')).toBe('OEBPS');
    expect(resolveNavDir('OEBPS', 'Text/nav.xhtml')).toBe('OEBPS/Text');
  });

  it('falls back to the OPF directory when no nav/NCX path exists', () => {
    expect(resolveNavDir('OEBPS', '')).toBe('OEBPS');
  });

  it('does not double-prefix an already-canonical nav path', () => {
    expect(resolveNavDir('OEBPS', 'OEBPS/nav.xhtml')).toBe('OEBPS');
  });
});

describe('findSpineIndex (loose TOC↔spine matching)', () => {
  const spine: EpubSpineItem[] = [
    { index: 0, idref: 'a', href: 'OEBPS/text00000.html', hrefRaw: 'text00000.html', linear: true },
    { index: 1, idref: 'b', href: 'OEBPS/text00001.html', hrefRaw: 'text00001.html', linear: true },
    { index: 2, idref: 'c', href: 'OEBPS/Text/ch1.html', hrefRaw: 'Text/ch1.html', linear: true },
  ];

  it('matches canonical paths exactly', () => {
    expect(findSpineIndex(spine, 'OEBPS/text00001.html')).toBe(1);
  });

  it('falls back to raw OPF hrefs (nav doc outside the OPF directory)', () => {
    expect(findSpineIndex(spine, 'text00001.html')).toBe(1);
  });

  it('falls back to a unique basename match', () => {
    expect(findSpineIndex(spine, 'ch1.html')).toBe(2);
  });

  it('returns -1 for unknown paths and ambiguous basenames', () => {
    expect(findSpineIndex(spine, 'missing.html')).toBe(-1);
    const amb: EpubSpineItem[] = [
      { index: 0, idref: 'a', href: 'OEBPS/a/ch1.html', hrefRaw: 'a/ch1.html', linear: true },
      { index: 1, idref: 'b', href: 'OEBPS/b/ch1.html', hrefRaw: 'b/ch1.html', linear: true },
    ];
    expect(findSpineIndex(amb, 'ch1.html')).toBe(-1);
    expect(findSpineIndex(amb, 'b/ch1.html')).toBe(1); // raw href match wins
  });
});

describe('fullTocHref (fragment re-attachment)', () => {
  it('re-attaches the stored fragment to the canonical href', () => {
    expect(fullTocHref({ href: 'OEBPS/text00002.html', fragment: 'a00752_0004_n0002' }))
      .toBe('OEBPS/text00002.html#a00752_0004_n0002');
  });

  it('passes fragment-less hrefs through unchanged', () => {
    expect(fullTocHref({ href: 'OEBPS/text00001.html' }))
      .toBe('OEBPS/text00001.html');
  });
});

describe('normalizeLanguageCode', () => {
  it('reduces language codes to their primary subtag', () => {
    expect(normalizeLanguageCode('ja')).toBe('ja');
    expect(normalizeLanguageCode('ja-JP')).toBe('ja');
    expect(normalizeLanguageCode('ZH_CN')).toBe('zh');
    expect(normalizeLanguageCode(' en-US ')).toBe('en');
  });

  it('returns null for missing or empty values', () => {
    expect(normalizeLanguageCode(undefined)).toBeNull();
    expect(normalizeLanguageCode('')).toBeNull();
    expect(normalizeLanguageCode(null)).toBeNull();
  });
});

describe('canonical spine↔TOC matching on real fixtures', () => {
  const root = 'tmp/testing-assets/epub';
  const files: string[] = [];
  try {
    for (const lang of readdirSync(root).filter(x => !x.startsWith('.'))) {
      for (const f of readdirSync(`${root}/${lang}`).filter(x => x.endsWith('.epub'))) {
        const p = `${root}/${lang}/${f}`;
        if (statSync(p).isFile()) files.push(p);
      }
    }
  } catch {
    // fixtures missing — tests skip
  }

  it.each(files.slice(0, 12))('every TOC href that targets the spine resolves (%s)', async file => {
    const zip = await JSZip.loadAsync(readFileSync(file));
    const container = await zip.file('META-INF/container.xml')!.async('text');
    const opfPath = attr(container, 'full-path')!;
    const opfDir = dirname(opfPath);
    const opf = await zip.file(opfPath)!.async('text');

    const manifest = new Map<string, { href: string; mt?: string; props?: string }>();
    for (const m of opf.matchAll(/<item\b([^>]*?)\/?>/gi)) {
      const id = attr(m[1], 'id');
      const href = attr(m[1], 'href');
      if (id && href) {
        manifest.set(id, {
          href,
          mt: attr(m[1], 'media-type'),
          props: attr(m[1], 'properties'),
        });
      }
    }
    const spineMatch = opf.match(/<spine\b[^>]*>([\s\S]*?)<\/spine>/i);
    const spineRaw: string[] = [];
    for (const m of (spineMatch?.[1] ?? '').matchAll(/<itemref\b([^>]*?)\/?>/gi)) {
      const idref = attr(m[1], 'idref');
      const item = manifest.get(idref ?? '');
      if (item) spineRaw.push(item.href);
    }
    const spineCanonical = new Set(spineRaw.map(h => resolvePath(opfDir, h)));
    expect(spineCanonical.size).toBeGreaterThan(0);

    // TOC source: nav doc first, NCX second.
    let tocBase = opfDir;
    let tocXml = '';
    const navItem = [...manifest.values()].find(i => i.props?.split(/\s+/).includes('nav'));
    const ncxItem = [...manifest.values()].find(
      i => i.mt === 'application/x-dtbncx+xml' || /\.ncx$/i.test(i.href),
    );
    if (navItem) {
      tocBase = dirname(resolvePath(opfDir, navItem.href));
      tocXml = await zip.file(resolvePath(opfDir, navItem.href))!.async('text');
    } else if (ncxItem) {
      tocXml = await zip.file(resolvePath(opfDir, ncxItem.href))!.async('text');
    }

    const hrefs: string[] = [];
    if (navItem) {
      const nav = tocXml.match(/<nav[^>]*epub:type\s*=\s*["']toc["'][^>]*>([\s\S]*?)<\/nav>/i);
      if (nav) {
        for (const a of nav[1]!.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>/gi)) hrefs.push(a[1]!);
      }
    } else {
      for (const np of tocXml.matchAll(/<navPoint\b[^>]*>([\s\S]*?)<\/navPoint>/g)) {
        const src = np[1]!.match(/<content\b[^>]*src="([^"]+)"/);
        if (src) hrefs.push(src[1]!);
      }
    }

    const resolvable = hrefs.filter(h => spineCanonical.has(resolvePath(tocBase, h)));
    // Books may legally include non-spine TOC entries; the overwhelming
    // majority must resolve so navigation/search don't silently miss them.
    expect(resolvable.length).toBeGreaterThanOrEqual(Math.floor(hrefs.length * 0.7));
  });

  it('Botchan-style multi-entry spine items canonicalize to distinct docs', async () => {
    // 坊っちゃん: 11 TOC entries across 4 spine items — canonicalization must
    // collapse fragment-only differences, not inflate the spine.
    const botchan = files.find(f => f.includes('坊っちゃん'));
    if (!botchan) return;
    const zip = await JSZip.loadAsync(readFileSync(botchan));
    const container = await zip.file('META-INF/container.xml')!.async('text');
    const opfPath = attr(container, 'full-path')!;
    const opfDir = dirname(opfPath);
    const opf = await zip.file(opfPath)!.async('text');
    const manifest = new Map<string, string>();
    for (const m of opf.matchAll(/<item\b([^>]*?)\/?>/gi)) {
      const id = attr(m[1], 'id');
      const href = attr(m[1], 'href');
      if (id && href) manifest.set(id, href);
    }
    const spineMatch = opf.match(/<spine\b[^>]*>([\s\S]*?)<\/spine>/i);
    const spineRaw: string[] = [];
    for (const m of (spineMatch?.[1] ?? '').matchAll(/<itemref\b([^>]*?)\/?>/gi)) {
      const item = manifest.get(attr(m[1], 'idref') ?? '');
      if (item) spineRaw.push(item);
    }
    const spineCanonical = new Set(spineRaw.map(h => resolvePath(opfDir, h)));
    const ncxPath = resolvePath(opfDir, [...manifest.values()].find(h => /\.ncx$/i.test(h))!);
    const ncx = await zip.file(ncxPath)!.async('text');
    const tocHrefs = [...ncx.matchAll(/<content\b[^>]*src="([^"]+)"/g)].map(m => m[1]!);
    const tocDocs = new Set(tocHrefs.map(h => resolvePath(opfDir, h)));
    expect(tocHrefs.length).toBeGreaterThan(5);
    expect(tocDocs.size).toBeLessThan(tocHrefs.length); // fragments share docs
    expect(spineCanonical.size).toBe(4);
  });
});
