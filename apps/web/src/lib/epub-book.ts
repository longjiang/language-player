/**
 * EpubBook — the whole-book model on top of epubjs.
 *
 * epubjs parses the package (spine, TOC, cover, content documents). This
 * layer fixes the model on top of it:
 *
 * 1. Canonical href resolution. epubjs leaves spine hrefs raw (OPF-relative)
 *    and TOC hrefs raw (nav-document-relative) — they never align, which
 *    breaks chapter lookup and search on books with nested nav docs. We
 *    resolve both to zip-relative canonical paths.
 * 2. The book as a flow: every spine item is converted once into EpubBlock[]
 *    with source mapping (element ids + char offsets), so TOC entries,
 *    internal links, search hits and saved positions all resolve to
 *    BookLocation { spineIndex, blockIndex, offset }.
 */

import type {
  BookLocation,
  EpubBlock,
  EpubBlockAnchor,
  EpubFormatRange,
  EpubImageBlock,
  EpubSpineItem,
  EpubTextBlock,
  TocMarker,
  TocNode,
} from './epub-book-types';
import { epubLog, epubWarn } from '@/lib/epub-log';

// ── Pure path helpers ──────────────────────────────────────────────────────

export function splitFragment(href: string): { path: string; fragment?: string } {
  const i = href.indexOf('#');
  return i === -1 ? { path: href } : { path: href.slice(0, i), fragment: href.slice(i + 1) };
}

function decodePath(p: string): string {
  try {
    return decodeURIComponent(p);
  } catch {
    return p;
  }
}

/** Resolve a relative href against a base directory → zip-relative path. */
export function resolvePath(baseDir: string, href: string): string {
  const { path } = splitFragment(href);
  if (!path) return baseDir;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(path)) return path;
  let p = path;
  if (p.startsWith('/')) p = p.slice(1);
  const parts = baseDir ? baseDir.split('/').filter(Boolean) : [];
  for (const seg of p.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return decodePath(parts.join('/'));
}

function dirname(path: string): string {
  const i = path.lastIndexOf('/');
  return i === -1 ? '' : path.slice(0, i);
}

/**
 * Directory of the nav/NCX document, canonicalized into the same path space
 * as spine hrefs. epubjs exposes navPath/ncxPath as raw OPF-relative hrefs
 * (e.g. "toc.ncx"); taking dirname() of the raw value drops the OPF
 * directory (e.g. "OEBPS"), so TOC hrefs end up as "text00002.html" while
 * spine hrefs canonicalize to "OEBPS/text00002.html" — and every TOC entry
 * fails to resolve. Resolve the nav href against the OPF dir first, the
 * same way all other manifest hrefs are resolved.
 */
export function resolveNavDir(opfDir: string, navPath: string): string {
  if (!navPath) return opfDir;
  if (navPath === opfDir || navPath.startsWith(`${opfDir}/`)) return dirname(navPath);
  return dirname(resolvePath(opfDir, navPath));
}

function locLte(a: BookLocation, b: BookLocation): boolean {
  return a.spineIndex < b.spineIndex ||
    (a.spineIndex === b.spineIndex && a.blockIndex < b.blockIndex) ||
    (a.spineIndex === b.spineIndex && a.blockIndex === b.blockIndex && a.offset <= b.offset);
}

/**
 * Find the spine item for a path. Exact canonical match first, then the raw
 * OPF href, then a unique basename match — some books resolve their TOC
 * against a different base than the OPF (e.g. a nav doc outside the OPF
 * directory), producing hrefs like "text00002.html" instead of
 * "OEBPS/text00002.html". Basename matching is only used when unambiguous.
 */
export function findSpineIndex(spine: EpubSpineItem[], path: string): number {
  const exact = spine.findIndex(s => s.href === path);
  if (exact !== -1) return exact;
  const raw = spine.findIndex(s => s.hrefRaw === path);
  if (raw !== -1) return raw;
  const base = path.split('/').pop();
  const matches = spine
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s.href.split('/').pop() === base);
  return matches.length === 1 ? matches[0]!.i : -1;
}

/**
 * TOC href with its fragment re-attached. Canonical TOC hrefs are stored
 * fragment-less (resolvePath strips the `#fragment`, which lives separately
 * on the node); navigation and markers must resolve with it or every entry
 * sharing a spine item collapses to block 0.
 */
export function fullTocHref(node: { href: string; fragment?: string }): string {
  return node.fragment ? `${node.href}#${node.fragment}` : node.href;
}

/**
 * Canonicalize an in-content link href against the containing spine item's
 * canonical href. Unlike resolvePath, this keeps the #fragment — a relative
 * link like "notesch1.html#ch01en01" must resolve to the anchor block, not
 * the top of the spine item.
 */
export function resolveLinkHref(fromHref: string, href: string): string {
  if (href.startsWith('#')) return `${splitFragment(fromHref).path}${href}`;
  const { path: hrefPath, fragment: hrefFragment } = splitFragment(href);
  const canonical = resolvePath(dirname(fromHref), hrefPath);
  return hrefFragment ? `${canonical}#${hrefFragment}` : canonical;
}

/**
 * Primary language subtag, lowercased ("ja", "ja-JP", "JA_JP" → "ja").
 * Returns null for empty/missing values.
 */
export function normalizeLanguageCode(code: string | null | undefined): string | null {
  if (!code) return null;
  const primary = code.trim().split(/[-_]/)[0]?.toLowerCase();
  return primary || null;
}

function flattenToc(toc: TocNode[]): { node: TocNode; depth: number; order: number }[] {
  const out: { node: TocNode; depth: number; order: number }[] = [];
  const walk = (nodes: TocNode[], depth: number) => {
    for (const node of nodes) {
      out.push({ node, depth, order: out.length });
      if (node.children.length) walk(node.children, depth + 1);
    }
  };
  walk(toc, 0);
  return out;
}

function buildPath(toc: TocNode[], target: TocNode): TocNode[] {
  const walk = (nodes: TocNode[], path: TocNode[]): TocNode[] | null => {
    for (const node of nodes) {
      const next = [...path, node];
      if (node === target) return next;
      const hit = walk(node.children, next);
      if (hit) return hit;
    }
    return null;
  };
  return walk(toc, []) ?? [target];
}

/** Convert a blob: cover URL into a stable data URL before persisting. */
async function toStableCoverUrl(url: string | null): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith('data:')) return url;
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    // Only image covers can be rendered with <img>. Some books use an XHTML
    // cover PAGE (e.g. Engels: <item href="cover.html" …/>) — a data URL of
    // that HTML would render as a broken image, so treat it as no cover.
    if (!blob.type.startsWith('image/')) return null;
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

// ── HTML → blocks (browser DOM walker) ─────────────────────────────────────

const BLOCK_TAGS = new Set([
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'blockquote', 'pre', 'li', 'div', 'section', 'article', 'header', 'footer',
  'figure', 'figcaption', 'aside', 'nav', 'main', 'table', 'thead', 'tbody',
  'tfoot', 'tr', 'td', 'th', 'ul', 'ol', 'hr', 'details', 'summary',
  'address', 'form', 'center', 'fieldset', 'dl', 'dt', 'dd', 'menu', 'caption',
]);

const SKIP_TAGS = new Set([
  'script', 'style', 'head', 'template', 'noscript', 'title', 'meta', 'link',
]);

type BlockKind = EpubTextBlock['type'];

/** Convert an HTML document body to EpubBlock[] (exported for tests). */
export function convertDocument(body: Element): EpubBlock[] {
  const blocks: EpubBlock[] = [];
  const idStack: string[] = [];
  const activeFormats: { type: 'bold' | 'italic' | 'code' | 'link'; url?: string }[] = [];
  let text = '';
  let formats: EpubFormatRange[] = [];
  let anchors: EpubBlockAnchor[] = [];

  const nearestId = (): string | undefined => idStack[idStack.length - 1];

  function appendText(s: string, keepLineBreaks = false) {
    if (!s) return;
    let t = keepLineBreaks
      ? s.replace(/[ \t\f\v]+/g, ' ')
      : s.replace(/\s+/g, ' ');
    if (!text && t) t = t.replace(/^\s+/, '');
    if (text && t) {
      const prev = text[text.length - 1]!;
      const next = t[0]!;
      if ((prev === ' ' || prev === '\n') && (next === ' ' || next === '\n')) {
        t = t.slice(1);
      }
    }
    if (!t) return;
    const start = text.length;
    for (const f of activeFormats) {
      formats.push({ start, end: start + t.length, type: f.type, url: f.url });
    }
    text += t;
  }

  function flushAs(kind: BlockKind, depth?: number, forceId?: string) {
    const trimmed = text.trim();
    text = '';
    const fmts = formats;
    const anc = anchors;
    formats = [];
    anchors = [];
    if (!trimmed) return;
    const len = trimmed.length;
    const srcId = forceId ?? nearestId();
    blocks.push({
      kind: 'text',
      type: kind,
      ...(depth !== undefined ? { depth } : {}),
      text: trimmed,
      formats: fmts
        .filter(f => f.start < len)
        .map(f => ({ ...f, end: Math.min(f.end, len) })),
      ...(srcId ? { srcElementId: srcId } : {}),
      srcCharBase: 0,
      anchors: anc
        .filter(a => a.offset < len)
        .map(a => ({ id: a.id, offset: Math.min(a.offset, len - 1) })),
    });
  }

  function flushInline() {
    flushAs('paragraph');
  }

  function emitImage(img: HTMLImageElement) {
    flushInline();
    const uri = img.getAttribute('src');
    if (!uri) return;
    const srcId = nearestId();
    const block: EpubImageBlock = {
      kind: 'image',
      imageUri: uri,
      ...(img.getAttribute('alt') ? { alt: img.getAttribute('alt')! } : {}),
      ...(srcId ? { srcElementId: srcId } : {}),
      srcCharBase: 0,
      anchors: [],
    };
    blocks.push(block);
  }

  function walkNode(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      appendText(node.textContent ?? '');
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    if (SKIP_TAGS.has(tag)) return;
    const id = el.getAttribute('id') || el.getAttribute('name') || undefined;

    if (tag === 'br') {
      appendText('\n', true);
      return;
    }
    if (tag === 'img') {
      emitImage(el as HTMLImageElement);
      return;
    }
    if (tag === 'ruby') {
      // Strip furigana; keep base text only (rt readings + rp fallback parens).
      const base: string[] = [];
      for (const child of el.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) base.push(child.textContent ?? '');
        else if (child.nodeType === Node.ELEMENT_NODE) {
          const t = (child as Element).tagName.toLowerCase();
          if (t !== 'rt' && t !== 'rtc' && t !== 'rp') base.push((child as Element).textContent ?? '');
        }
      }
      appendText(base.join(''));
      return;
    }
    if (tag === 'rt' || tag === 'rtc' || tag === 'rp') return;

    if (BLOCK_TAGS.has(tag)) {
      flushInline();
      const blockId = id ?? nearestId();
      if (id) idStack.push(id);
      for (const child of Array.from(el.childNodes)) walkNode(child);
      if (id) idStack.pop();
      const h = /^h([1-6])$/.exec(tag);
      if (h) flushAs('heading', Number(h[1]), blockId);
      else if (tag === 'li') flushAs('list-item', undefined, blockId);
      else if (tag === 'blockquote') flushAs('blockquote', undefined, blockId);
      else if (tag === 'pre') flushAs('pre', undefined, blockId);
      else flushAs('paragraph', undefined, blockId);
      return;
    }

    // Inline element.
    if (id) anchors.push({ id, offset: text.length });
    if (tag === 'a') {
      // Anchor-only elements (fragment targets like <a id="ch04"/> or
      // <a name="…"/>) have no href and must NOT become links — in HTML-parsed
      // content docs their self-closing form opens a real anchor that can
      // swallow following blocks until the next </a>, which would render
      // whole paragraphs as hyperlinks. Still walk children so text is kept.
      const linkHref = el.getAttribute('href');
      if (linkHref) activeFormats.push({ type: 'link', url: linkHref });
      for (const child of Array.from(el.childNodes)) walkNode(child);
      if (linkHref) activeFormats.pop();
    } else if (tag === 'b' || tag === 'strong') {
      activeFormats.push({ type: 'bold' });
      for (const child of Array.from(el.childNodes)) walkNode(child);
      activeFormats.pop();
    } else if (tag === 'i' || tag === 'em') {
      activeFormats.push({ type: 'italic' });
      for (const child of Array.from(el.childNodes)) walkNode(child);
      activeFormats.pop();
    } else if (tag === 'code' || tag === 'kbd' || tag === 'samp') {
      activeFormats.push({ type: 'code' });
      for (const child of Array.from(el.childNodes)) walkNode(child);
      activeFormats.pop();
    } else {
      for (const child of Array.from(el.childNodes)) walkNode(child);
    }
  }

  for (const child of Array.from(body.childNodes)) walkNode(child);
  flushAs('paragraph');
  return blocks;
}

// ── EpubBook ───────────────────────────────────────────────────────────────

interface EpubjsTocItem {
  id?: string;
  href: string;
  label: string;
  subitems?: EpubjsTocItem[];
}

export class EpubBook {
  readonly title: string;
  readonly author: string;
  readonly coverUrl: string | null;
  readonly pageProgressionDir: 'ltr' | 'rtl';
  readonly spine: EpubSpineItem[];
  readonly toc: TocNode[];

  private readonly book: any;
  private readonly spineRaw: any;
  private readonly blocksCache = new Map<number, Promise<EpubBlock[]>>();
  private readonly hrefCache = new Map<string, Promise<BookLocation | null>>();
  private readonly textCache = new Map<number, Promise<{ text: string; starts: number[] }>>();
  private markersPromise: Promise<TocMarker[]> | null = null;
  private totalCharsPromise: Promise<number> | null = null;

  private constructor(
    book: any,
    spineRaw: any,
    spine: EpubSpineItem[],
    toc: TocNode[],
    coverUrl: string | null,
    pageProgressionDir: 'ltr' | 'rtl',
  ) {
    this.book = book;
    this.spineRaw = spineRaw;
    this.spine = spine;
    this.toc = toc;
    this.coverUrl = coverUrl;
    this.pageProgressionDir = pageProgressionDir;
    this.title = book?.package?.metadata?.title ?? '';
    this.author = book?.package?.metadata?.creator ?? '';
  }

  static async open(data: ArrayBuffer): Promise<EpubBook> {
    const ePub = (await import('epubjs')).default;
    // epubjs's public typings don't cover archive/container/packaging internals.
    const book: any = ePub(data);
    const [nav, spineRaw] = await Promise.all([
      book.loaded.navigation,
      book.loaded.spine,
    ]);

    const opfPath = book.container?.packagePath ?? '';
    const opfDir = dirname(opfPath);
    const navPath = book.packaging?.navPath || book.packaging?.ncxPath || '';
    const navDir = resolveNavDir(opfDir, navPath);

    // Some EPUBs carry dangling spine itemrefs (e.g. <itemref idref="cover"/>
    // with no matching manifest item — 1926 Չարենց - Երկիր Նաիրի.epub).
    // epubjs keeps those items with href=undefined; resolving them would
    // throw, so drop them like the mobile parser does.
    const spine: EpubSpineItem[] = (spineRaw.items as any[])
      .map((s: any, index: number) => ({
        index,
        idref: s.idref,
        href: s.href ? resolvePath(opfDir, s.href) : '',
        hrefRaw: s.href,
        linear: s.linear !== 'no',
      }))
      .filter((s) => s.href);

    const mapToc = (items: EpubjsTocItem[] | undefined, baseDir = navDir): TocNode[] =>
      (items ?? []).map(item => {
        const { fragment } = splitFragment(item.href);
        return {
          id: item.id || undefined,
          label: item.label.replace(/\s+/g, ' ').trim(),
          href: resolvePath(baseDir, item.href),
          ...(fragment ? { fragment } : {}),
          children: mapToc(item.subitems, baseDir),
        };
      });

    let toc = mapToc(nav.toc as EpubjsTocItem[]);
    if (toc.length === 0) {
      // epubjs only recognizes <nav epub:type="toc">. Some EPUB 3 books
      // (e.g. 1Q84) ship a nav doc whose TOC nav only has id="toc" — epubjs
      // returns [] and would fall back to "Chapter N". Try the NCX first,
      // then the nav by id, to match the mobile parser.
      const ncxPath = book.packaging?.ncxPath;
      if (ncxPath) {
        try {
          const ncxDoc = await book.load(ncxPath);
          if (ncxDoc && typeof ncxDoc.nodeType === 'number') {
            nav.parse(ncxDoc);
            toc = mapToc(nav.toc as EpubjsTocItem[], opfDir);
          }
        } catch (err) {
          epubWarn(`NCX TOC fallback failed (${ncxPath}) — falling back to spine labels`, err);
        }
      }
      if (toc.length === 0 && book.packaging?.navPath) {
        try {
          const navDoc = await book.load(book.packaging.navPath);
          const tocNav =
            navDoc?.querySelector?.('nav#toc') ??
            navDoc?.querySelector?.('nav[role="doc-toc"]');
          const navList = tocNav?.querySelector('ol') ?? undefined;
          if (navList) {
            toc = mapToc(nav.parseNavList(navList) as EpubjsTocItem[]);
          }
        } catch (err) {
          epubWarn('nav-by-id TOC fallback failed — falling back to spine labels', err);
        }
      }
    }
    if (toc.length === 0) {
      toc = spine.map((s, i) => ({
        label: `Chapter ${i + 1}`,
        href: s.href,
        children: [],
      }));
    }

    let coverUrl: string | null = null;
    try {
      coverUrl = await toStableCoverUrl(await book.coverUrl());
    } catch {
      // No cover (or unreadable) — the bookshelf shows a placeholder.
    }
    const progression = book.package?.metadata?.['page-progression-direction'];
    return new EpubBook(
      book,
      spineRaw,
      spine,
      toc,
      coverUrl,
      progression === 'rtl' ? 'rtl' : 'ltr',
    );
  }

  /** Convert one spine item to blocks (cached). */
  getBlocks(spineIndex: number): Promise<EpubBlock[]> {
    const cached = this.blocksCache.get(spineIndex);
    if (cached) return cached;
    const run = (async (): Promise<EpubBlock[]> => {
      const item = this.spine[spineIndex];
      if (!item) return [];
      epubLog(`getBlocks spine ${spineIndex} (${item.hrefRaw}) — loading section…`);
      try {
        const section = this.spineRaw.get(item.hrefRaw);
        if (!section) {
          epubWarn(`getBlocks spine ${spineIndex}: section not found — returning []`);
          return [];
        }
        const contents = await section.load(this.book.load.bind(this.book));
        const body: Element | null =
          contents.querySelector('body') ?? contents;
        if (!body) {
          epubWarn(`getBlocks spine ${spineIndex}: no <body> — returning []`);
          return [];
        }

        // Resolve images to session blob URLs via the epubjs archive cache.
        // Fall back to our own canonical path resolver (dirname of the spine
        // href) when epubjs's book.path.resolve misses — otherwise the raw
        // relative src (e.g. "0002.jpg") 404s against the page URL.
        const urlCache = this.book.archive?.urlCache ?? {};
        const srcToBlob = (src: string): string | null => {
          const resolvedByEpubjs = this.book.path?.resolve?.(src);
          if (resolvedByEpubjs && urlCache[resolvedByEpubjs]) {
            return urlCache[resolvedByEpubjs] as string;
          }
          const resolvedOurs = resolvePath(dirname(item.hrefRaw), src);
          if (resolvedOurs && urlCache[resolvedOurs]) {
            return urlCache[resolvedOurs] as string;
          }
          epubWarn(
            `getBlocks spine ${spineIndex}: image src "${src}" unresolvable ` +
              `(epubjs=${String(resolvedByEpubjs)} ours=${String(resolvedOurs)} urlCacheHits=${Object.keys(urlCache).length}) — keeping raw src`,
          );
          return null;
        };
        body.querySelectorAll('img').forEach(img => {
          const src = img.getAttribute('src');
          if (!src) return;
          const blob = srcToBlob(src);
          if (blob) img.setAttribute('src', blob);
        });
        body.querySelectorAll('image').forEach(img => {
          const src = img.getAttribute('xlink:href') || img.getAttribute('href');
          if (!src) return;
          const blob = srcToBlob(src);
          if (blob) img.setAttribute('xlink:href', blob);
        });

        const blocks = convertDocument(body);
        epubLog(`getBlocks spine ${spineIndex}: ${blocks.length} blocks`);
        return blocks;
      } catch (err) {
        epubWarn(`getBlocks spine ${spineIndex} failed — returning []`, err);
        return [];
      }
    })();
    this.blocksCache.set(spineIndex, run);
    return run;
  }

  /**
   * Resolve an href to a BookLocation. TOC hrefs are already canonical;
   * pass `fromHref` (the current spine item's canonical href) for in-content
   * links, so relative paths and same-document #fragments resolve correctly.
   */
  resolveHref(href: string, fromHref?: string): Promise<BookLocation | null> {
    const key = fromHref ? `${fromHref}\u0000${href}` : href;
    const cached = this.hrefCache.get(key);
    if (cached) return cached;
    const run = (async (): Promise<BookLocation | null> => {
      if (!href || href === '#') return null;
      if (/^[a-z][a-z0-9+.-]*:\/\//i.test(href)) return null;
      let canonical = href;
      if (fromHref) {
        canonical = resolveLinkHref(fromHref, href);
      }
      const hashIdx = canonical.indexOf('#');
      const path = hashIdx === -1 ? canonical : canonical.slice(0, hashIdx);
      const fragment = hashIdx === -1 ? undefined : canonical.slice(hashIdx + 1);
      const spineIndex = findSpineIndex(this.spine, path);
      if (spineIndex === -1) {
        epubWarn(`resolveHref "${href}": no spine item for path "${path}" — returning null`);
        return null;
      }
      if (!fragment) {
        epubLog(`resolveHref "${href}" → spine ${spineIndex} block 0`);
        return { spineIndex, blockIndex: 0, offset: 0 };
      }
      const blocks = await this.getBlocks(spineIndex);
      const findFragment = (frag: string): BookLocation | null => {
        for (let i = 0; i < blocks.length; i++) {
          if (blocks[i]!.srcElementId === frag) {
            return { spineIndex, blockIndex: i, offset: 0 };
          }
        }
        for (let i = 0; i < blocks.length; i++) {
          const anchor = blocks[i]!.anchors.find(a => a.id === frag);
          if (anchor) return { spineIndex, blockIndex: i, offset: anchor.offset };
        }
        return null;
      };
      // Exact match first, then tolerate the publisher "i"-prefix convention
      // (markers like id="ifw01en01" linked as "#fw01en01"): try the fragment
      // without a leading "i", then with one.
      let location = findFragment(fragment);
      if (!location && fragment.startsWith('i')) {
        location = findFragment(fragment.slice(1));
      }
      if (!location) {
        const prefixed = `i${fragment}`;
        if (prefixed !== fragment) location = findFragment(prefixed);
      }
      if (location) {
        epubLog(`resolveHref "${href}" → spine ${location.spineIndex} block ${location.blockIndex} offset ${location.offset} (fragment "#${fragment}")`);
        return location;
      }
      epubWarn(`resolveHref "${href}": fragment "#${fragment}" not found in spine ${spineIndex} — falling back to block 0`);
      return { spineIndex, blockIndex: 0, offset: 0 };
    })();
    this.hrefCache.set(key, run);
    return run;
  }

  /** Resolve every TOC entry to a marker (unresolvable entries are skipped). */
  tocMarkers(): Promise<TocMarker[]> {
    if (this.markersPromise) return this.markersPromise;
    this.markersPromise = (async () => {
      const markers: TocMarker[] = [];
      for (const { node, order } of flattenToc(this.toc)) {
        const location = await this.resolveHref(fullTocHref(node));
        if (!location) continue;
        markers.push({ node, path: buildPath(this.toc, node), location, order });
      }
      return markers;
    })();
    return this.markersPromise;
  }

  /** Normalized plain text + per-block start offsets for one spine item. */
  spineTextData(spineIndex: number): Promise<{ text: string; starts: number[] }> {
    const cached = this.textCache.get(spineIndex);
    if (cached) return cached;
    const run = (async () => {
      const blocks = await this.getBlocks(spineIndex);
      const parts: string[] = [];
      const starts: number[] = [];
      let pos = 0;
      for (const block of blocks) {
        if (block.kind !== 'text') continue;
        parts.push(block.text);
        starts.push(pos);
        pos += block.text.length + 1;
      }
      return { text: parts.join('\n'), starts };
    })();
    this.textCache.set(spineIndex, run);
    return run;
  }

  /** Total normalized plain-text length of the whole book. */
  totalTextLength(): Promise<number> {
    if (this.totalCharsPromise) return this.totalCharsPromise;
    this.totalCharsPromise = (async () => {
      let total = 0;
      for (let i = 0; i < this.spine.length; i++) {
        total += (await this.spineTextData(i)).text.length;
      }
      return total;
    })();
    return this.totalCharsPromise;
  }

  /** Chapter label for a location (nearest preceding TOC entry). */
  async chapterLabelAt(location: BookLocation): Promise<string> {
    const markers = await this.tocMarkers();
    let label = '';
    for (const m of markers) {
      if (locLte(m.location, location)) label = m.node.label;
    }
    return label;
  }
}
