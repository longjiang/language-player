import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import JSZip from 'jszip';
import { resolvePath, splitFragment } from './epub-book';

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
