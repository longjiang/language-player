export interface TocItem {
  label: string;
  href: string;
  children?: TocItem[];
}

export interface EpubManifestItem {
  id: string;
  href: string;
  mediaType?: string;
  props?: string;
}

/** Inline format range mapped onto a text block's characters (SPEC-049 §9.7). */
export interface EpubFormatRange {
  start: number;
  end: number;
  type: 'link' | 'highlight';
  /** Raw href from the source document (relative or absolute, may carry #fragment). */
  url?: string;
}

/** A converted EPUB text block (paragraph/heading/list item/…). */
export interface EpubTextBlock {
  kind: 'text';
  type: 'paragraph' | 'heading' | 'list-item' | 'blockquote' | 'pre';
  depth?: number;
  text: string;
  /** id of the source element (or nearest ancestor with an id) — used to resolve #fragments. */
  srcElementId?: string;
  formats?: EpubFormatRange[];
}

export interface EpubImageBlock {
  kind: 'image';
  uri: string;
  alt?: string;
}

export type EpubBlock = EpubTextBlock | EpubImageBlock;

export interface EpubMetadata {
  spine: { href: string; title: string }[];
  toc: TocItem[];
  coverBase64: string | null;
  coverItemId: string | null;
  opfDir: string;
  title: string;
  author: string;
  /** Primary language subtag from the OPF metadata (e.g. "ja"), or null. */
  language: string | null;
}

/** Strip fragment identifier (#...) from a URI. */
function stripFragment(href: string): string {
  const idx = href.indexOf('#');
  return idx === -1 ? href : href.slice(0, idx);
}

/** Extract one XML attribute value, supporting both double and single quotes. */
function extractAttr(attrsStr: string, name: string): string | undefined {
  const m = attrsStr.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`)) ??
           attrsStr.match(new RegExp(`${name}\\s*=\\s*'([^']*)'`));
  return m?.[1];
}

/**
 * Parse OPF file to extract manifest, spine, cover, and TOC.
 * All attribute extraction is order-independent.
 * Prefers nav document (EPUB 3) > NCX (EPUB 2) > spine fallback.
 * @param navDir — directory of the EPUB 3 nav document (for resolving its relative hrefs)
 */
export function parseOPF(
  opfXml: string,
  opfDir: string,
  ncxXml?: string,
  navXml?: string,
  navDir?: string,
): EpubMetadata {
  // Manifest: <item id="X" href="Y" media-type="Z" />
  const manifest = new Map<string, string>();
  const itemRegex = /<item\b([^>]*)>/g;
  let m: RegExpExecArray | null;
  while ((m = itemRegex.exec(opfXml)) !== null) {
    const a = m[1]!;
    const id = extractAttr(a, 'id');
    const href = extractAttr(a, 'href');
    if (id && href) manifest.set(id, href);
  }

  // Spine: <spine> → <itemref idref="X" />
  const spineMatch = opfXml.match(/<spine[^>]*>([\s\S]*?)<\/spine>/);
  const idrefs = spineMatch?.[1]?.match(/idref="([^"]+)"/g)
    ?.map((s) => s.replace(/idref="([^"]+)"/, '$1')) ?? [];

  const spine: { href: string; title: string }[] = [];
  for (const idref of idrefs) {
    const href = manifest.get(idref);
    if (href) spine.push({ href: resolvePath(opfDir, href), title: '' });
  }

  // Cover image — try EPUB 3 (<item properties="cover-image">), fall back to EPUB 2 (<meta name="cover">)
  let coverBase64: string | null = null;
  let coverItemId: string | null = null;

  // EPUB 3: look for <item properties="cover-image">
  const coverItemRegex = /<item\b([^>]*)>/g;
  let ci: RegExpExecArray | null;
  while ((ci = coverItemRegex.exec(opfXml))) {
    const props = extractAttr(ci[1]!, 'properties');
    if (props && props.split(/\s+/).includes('cover-image')) {
      coverItemId = extractAttr(ci[1]!, 'id') ?? null;
      coverBase64 = extractAttr(ci[1]!, 'href') ?? null;
      break;
    }
  }

  // EPUB 2: fall back to <meta name="cover" content="..."> or <meta property="cover">
  if (!coverBase64) {
    const metaRegex = /<meta\b([^>]*)>/g;
    let mm: RegExpExecArray | null;
    while ((mm = metaRegex.exec(opfXml))) {
      const metaName = extractAttr(mm[1]!, 'name');
      const metaProp = extractAttr(mm[1]!, 'property');
      if (metaName === 'cover' || metaProp === 'cover') {
        const coverId = extractAttr(mm[1]!, 'content');
        if (coverId) {
          coverItemId = coverId;
          const itemRegex3 = /<item\b([^>]*)>/g;
          let im3: RegExpExecArray | null;
          while ((im3 = itemRegex3.exec(opfXml))) {
            if (extractAttr(im3[1]!, 'id') === coverId) {
              coverBase64 = extractAttr(im3[1]!, 'href') || null;
              break;
            }
          }
        }
        break;
      }
    }
  }

  // TOC: prefer nav document (EPUB 3) > NCX (EPUB 2) > spine fallback
  let toc: TocItem[] = [];
  if (navXml) {
    // Resolve nav doc hrefs against the nav doc's own directory, not OPF dir
    toc = parseNavDocument(navXml, navDir ?? opfDir);
  }
  if (toc.length === 0 && ncxXml) {
    toc = parseNCX(ncxXml, manifest, opfDir);
  }

  // ── DC metadata: title & author ──
  let title = '';
  let author = '';
  const metaMatch = opfXml.match(/<metadata[^>]*>([\s\S]*?)<\/metadata>/i);
  if (metaMatch) {
    const metaXml = metaMatch[1]!;
    // dc:title (with optional xml:lang; handle both dc:title and bare title elements)
    const titleM = metaXml.match(/<dc:title[^>]*>([^<]+)<\/dc:title>/i);
    if (titleM) title = titleM[1]!.trim();
    // dc:creator (author)
    const creatorM = metaXml.match(/<dc:creator[^>]*>([^<]+)<\/dc:creator>/i);
    if (creatorM) author = creatorM[1]!.trim();
  }

  // ── DC metadata: language (for the language-specific bookshelf, SPEC-049 §9.3) ──
  let language: string | null = null;
  if (metaMatch) {
    const metaXml = metaMatch[1]!;
    const langM = metaXml.match(/<dc:language[^>]*>([^<]+)<\/dc:language>/i);
    if (langM) language = langM[1]!.trim() || null;
  }

  return { spine, toc, coverBase64, coverItemId, opfDir, title, author, language };
}

// ── EPUB 3 nav document parser ──

/**
 * Parse EPUB 3 nav document (nav.xhtml) for nested TOC.
 * Looks for <nav epub:type="toc"> and extracts nested <ol>/<li>/<a>.
 * @param navDir — directory of the nav document itself (for resolving relative hrefs)
 */
function parseNavDocument(navHtml: string, navDir: string): TocItem[] {
  const navMatch = navHtml.match(
    /<nav[^>]*epub:type\s*=\s*["']toc["'][^>]*>([\s\S]*?)<\/nav>/i,
  ) ?? navHtml.match(
    /<nav[^>]*id\s*=\s*["']toc["'][^>]*>([\s\S]*?)<\/nav>/i,
  ) ?? navHtml.match(
    /<nav[^>]*role\s*=\s*["']doc-toc["'][^>]*>([\s\S]*?)<\/nav>/i,
  );
  if (!navMatch) return [];
  return parseNavList(navMatch[1]!, navDir);
}

/**
 * Recursively parse <ol>/<li> structure from a nav document fragment.
 * Tracks <li> nesting depth by counting open/close tags.
 */
function parseNavList(html: string, baseDir: string): TocItem[] {
  const items: TocItem[] = [];
  // Remove wrapping <ol> if present
  let inner = html.trim();
  const olMatch = inner.match(/^<ol\b[^>]*>([\s\S]*)<\/ol>\s*$/i);
  if (olMatch) inner = olMatch[1]!.trim();

  let pos = 0;
  while (pos < inner.length) {
    const liStart = inner.indexOf('<li', pos);
    if (liStart === -1) break;
    const gtPos = inner.indexOf('>', liStart);
    if (gtPos === -1) break;

    // Find matching </li> by counting nesting depth
    let depth = 1;
    let scanPos = gtPos + 1;
    while (depth > 0 && scanPos < inner.length) {
      const nextOpen = inner.indexOf('<li', scanPos);
      const nextClose = inner.indexOf('</li>', scanPos);
      if (nextClose === -1) break;
      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth++;
        scanPos = nextOpen + 3;
      } else {
        depth--;
        scanPos = nextClose + 5;
      }
    }

    const liContent = inner.slice(gtPos + 1, scanPos - 5).trim();

    const aMatch = liContent.match(
      /<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i,
    );
    if (aMatch) {
      // Keep the #fragment on the href — TOC entries are bookmarks into the
      // spine flow, and fragments are how multi-chapter spine items resolve
      // to distinct positions (SPEC-049 §9.1 / Botchan regression).
      const rawHref = aMatch[1]!;
      const fragIdx = rawHref.indexOf('#');
      const filePart = fragIdx === -1 ? rawHref : rawHref.slice(0, fragIdx);
      const frag = fragIdx === -1 ? '' : rawHref.slice(fragIdx);
      const href = resolvePath(baseDir, filePart) + frag;
      const label = aMatch[2]!.replace(/<[^>]+>/g, '').trim();
      // Check for nested <ol>
      const olContent = liContent.match(
        /<ol\b[^>]*>([\s\S]*?)<\/ol>/i,
      );
      const children = olContent
        ? parseNavList(olContent[1]!, baseDir)
        : undefined;
      items.push({
        label,
        href,
        children: children?.length ? children : undefined,
      });
    }

    pos = scanPos;
  }

  return items;
}

// ── EPUB 2 NCX parser ──

/**
 * Parse NCX file into recursive TocItem[] (handles nested navPoints).
 */
function parseNCX(
  ncxXml: string,
  manifest: Map<string, string>,
  opfDir: string,
): TocItem[] {
  const navMapMatch = ncxXml.match(/<navMap[^>]*>([\s\S]*)<\/navMap>/i);
  if (!navMapMatch) return [];
  return parseNavPoints(navMapMatch[1]!, manifest, opfDir);
}

/**
 * Recursively extract <navPoint> elements tracking nesting depth.
 */
function parseNavPoints(
  xml: string,
  manifest: Map<string, string>,
  opfDir: string,
): TocItem[] {
  const items: TocItem[] = [];
  let pos = 0;
  while (pos < xml.length) {
    const npStart = xml.indexOf('<navPoint', pos);
    if (npStart === -1) break;
    const gtPos = xml.indexOf('>', npStart);
    if (gtPos === -1) break;

    // Find matching </navPoint> by counting nesting depth
    let depth = 1;
    let scanPos = gtPos + 1;
    while (depth > 0 && scanPos < xml.length) {
      const nextOpen = xml.indexOf('<navPoint', scanPos);
      const nextClose = xml.indexOf('</navPoint>', scanPos);
      if (nextClose === -1) break;
      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth++;
        scanPos = nextOpen + 9;
      } else {
        depth--;
        scanPos = nextClose + 11;
      }
    }

    const npContent = xml.slice(gtPos + 1, scanPos - 11).trim();

    const labelMatch = npContent.match(
      /<navLabel>[\s\S]*?<text>([^<]+)<\/text>/,
    );
    const srcMatch = npContent.match(
      /<content\b[^>]*src="([^"]+)"/,
    );
    const label = labelMatch?.[1]?.trim() ?? 'Untitled';
    const src = srcMatch?.[1] ?? '';
    // Strip fragment for the manifest lookup, but keep it on the resulting
    // href so chapter bookmarks inside a spine item resolve to their exact
    // block (SPEC-049 §9.1).
    const fragIdx = src.indexOf('#');
    const srcNoFrag = fragIdx === -1 ? src : src.slice(0, fragIdx);
    const frag = fragIdx === -1 ? '' : src.slice(fragIdx);
    const itemId = srcNoFrag;
    const href = (manifest.get(itemId) ?? resolvePath(opfDir, srcNoFrag)) + frag;

    // Check for nested navPoints
    const children = parseNavPoints(npContent, manifest, opfDir);

    items.push({
      label,
      href,
      children: children.length ? children : undefined,
    });

    pos = scanPos;
  }
  return items;
}

/**
 * Resolve a relative path against a base directory, normalizing `../` segments.
 * JSZip uses forward-slash paths without leading slash, so we normalize accordingly.
 */
export function resolvePath(base: string, href: string): string {
  if (href.includes('://')) return href;
  // For absolute paths, strip the leading slash (zip paths never start with /)
  if (href.startsWith('/')) return href.slice(1);
  const combined = base + href;
  // Normalize ../ and ./ segments
  const parts = combined.split('/');
  const result: string[] = [];
  for (const part of parts) {
    if (part === '..') {
      result.pop();
    } else if (part !== '.' && part !== '') {
      result.push(part);
    }
  }
  return result.join('/');
}

// ── HTML → block conversion (whole-book model, SPEC-049 §9.1/9.7) ─────────

/** Decode common HTML entities (named + numeric). */
function decodeEntities(text: string): string {
  const named: Record<string, string> = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
    mdash: '—', ndash: '–', hellip: '…', lsquo: '\u2018', rsquo: '\u2019',
    ldquo: '\u201C', rdquo: '\u201D', middot: '·', bull: '•', eacute: 'é',
    egrave: 'è', ecirc: 'ê', agrave: 'à', uuml: 'ü', ouml: 'ö', auml: 'ä',
    szlig: 'ß', deg: '°', times: '×', copy: '©', reg: '®',
  };
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex: string) => {
      const cp = parseInt(hex, 16);
      return Number.isNaN(cp) ? _m : String.fromCodePoint(cp);
    })
    .replace(/&#(\d+);/g, (_m, dec: string) => {
      const cp = parseInt(dec, 10);
      return Number.isNaN(cp) ? _m : String.fromCodePoint(cp);
    })
    .replace(/&([a-zA-Z]+);/g, (_m, name: string) => named[name] ?? _m);
}

/** Normalize a fragment id for comparison (percent-decoding, best effort). */
export function normalizeFragmentId(id: string): string {
  try { return decodeURIComponent(id); } catch { return id; }
}

type EpubFrameType =
  | 'root'
  | 'container'
  | 'paragraph'
  | 'heading'
  | 'list-item'
  | 'blockquote'
  | 'pre';

interface BlockFrame {
  type: EpubFrameType;
  /** Original HTML tag name (for matching closing tags). */
  tag: string;
  depth?: number;
  /** Element's own id attribute. */
  id?: string;
  /** Nearest ancestor (or own) id — becomes the block's srcElementId. */
  nearestId?: string;
  text: string;
  formats: EpubFormatRange[];
  /** True when the frame has direct inline text/images/links (not just child blocks). */
  hasInlineContent: boolean;
  /** Blocks emitted by nested block frames (finalized when they close). */
  emitted: EpubBlock[];
}

const BLOCK_TAGS: Record<string, { type: EpubFrameType; depth?: number }> = {
  p: { type: 'paragraph' },
  h1: { type: 'heading', depth: 1 },
  h2: { type: 'heading', depth: 2 },
  h3: { type: 'heading', depth: 3 },
  h4: { type: 'heading', depth: 4 },
  h5: { type: 'heading', depth: 5 },
  h6: { type: 'heading', depth: 6 },
  blockquote: { type: 'blockquote' },
  li: { type: 'list-item' },
  pre: { type: 'pre' },
  div: { type: 'container' },
  section: { type: 'container' },
  article: { type: 'container' },
  main: { type: 'container' },
  table: { type: 'container' },
  thead: { type: 'container' },
  tbody: { type: 'container' },
  tfoot: { type: 'container' },
  tr: { type: 'container' },
  ul: { type: 'container' },
  ol: { type: 'container' },
  nav: { type: 'container' },
  header: { type: 'container' },
  footer: { type: 'container' },
};

/** Extract an attribute value (double or single quoted) from a tag string. */
function attrValue(tagAttrs: string, name: string): string | undefined {
  const re = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i');
  const m = tagAttrs.match(re);
  return m?.[2] ?? m?.[3];
}

const IMG_MARKER_RE = /\[IMG:([^\]]+)\]/g;

/**
 * Convert an EPUB content document's HTML into content blocks.
 *
 * This is the whole-book model's per-spine converter (SPEC-049 §9.1): it walks
 * block-level elements, records each block's source element id (own or nearest
 * ancestor) so `#fragment` TOC entries and internal links resolve precisely,
 * and captures `<a href>` ranges as link formats (SPEC-049 §9.7). Images are
 * resolved through `resolveImage` and emitted as standalone image blocks.
 */
export function convertHtmlToBlocks(
  html: string,
  contentDir: string,
  resolveImage: (resolvedPath: string) => string | null,
): EpubBlock[] {
  const clean = html
    .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<!DOCTYPE[^>]*>/gi, '')
    .replace(/<\?xml[^>]*\?>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  const root: BlockFrame = { type: 'root', tag: '', text: '', formats: [], hasInlineContent: false, emitted: [] };
  const stack: BlockFrame[] = [root];
  /** Link ranges still open per frame (closed on `</a>`). */
  const openLinks = new Map<BlockFrame, EpubFormatRange>();

  const current = () => stack[stack.length - 1]!;

  const openFrame = (type: EpubFrameType, tag: string, depth: number | undefined, attrs: string) => {
    const ownId = attrValue(attrs, 'id');
    const frame: BlockFrame = {
      type,
      tag,
      depth,
      id: ownId,
      nearestId: ownId,
      text: '',
      formats: [],
      hasInlineContent: false,
      emitted: [],
    };
    stack.push(frame);
    return frame;
  };

  const closeFrame = () => {
    const frame = stack.pop()!;
    const blocks = finalizeFrame(frame);
    stack[stack.length - 1]!.emitted.push(...blocks);
  };

  const tagRe = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g;
  let scanPos = 0;
  let m: RegExpExecArray | null;

  while ((m = tagRe.exec(clean)) !== null) {
    const textBefore = clean.slice(scanPos, m.index);
    if (textBefore) appendText(current(), decodeEntities(textBefore));
    scanPos = tagRe.lastIndex;

    const rawTag = m[0];
    const tag = m[1]!.toLowerCase();
    const attrs = m[2] ?? '';
    const isClosing = rawTag.startsWith('</');

    if (isClosing) {
      if (tag === 'a') {
        const frame = current();
        const range = openLinks.get(frame);
        if (range) {
          range.end = frame.text.length;
          openLinks.delete(frame);
        }
        continue;
      }
      // Close the innermost open frame with this tag name (handles stray nesting).
      for (let i = stack.length - 1; i >= 1; i--) {
        if (stack[i]!.tag === tag) {
          while (stack.length - 1 >= i) closeFrame();
          break;
        }
      }
      continue;
    }

    const blockSpec = BLOCK_TAGS[tag];
    if (blockSpec) {
      const parent = current();
      const frame = openFrame(blockSpec.type, tag, blockSpec.depth, attrs);
      // Inherit the nearest anchor id from the parent so fragments on inline
      // elements inside this block are preserved.
      if (!frame.id) frame.nearestId = parent.nearestId ?? parent.id;
      // A link may wrap a block (rare) — keep the range attached to the frame.
      const openRange = openLinks.get(parent);
      if (openRange) openLinks.set(frame, openRange);
      continue;
    }

    if (tag === 'br') {
      current().text += '\n';
      continue;
    }

    if (tag === 'img') {
      const src = attrValue(attrs, 'src');
      if (src && !src.includes('://')) {
        const resolvedPath = resolvePath(contentDir, src);
        const uri = resolveImage(resolvedPath);
        if (uri) {
          current().text += `[IMG:${uri}]`;
          current().hasInlineContent = true;
        }
      }
      continue;
    }

    if (tag === 'a') {
      const href = attrValue(attrs, 'href');
      const start = current().text.length;
      const range: EpubFormatRange = { start, end: start, type: 'link', url: href ?? '#' };
      current().formats.push(range);
      openLinks.set(current(), range);
      continue;
    }

    // Any other opening tag: ids on inline elements (span/a/div) matter for
    // fragment resolution — record the nearest id and continue walking.
    const id = attrValue(attrs, 'id');
    if (id) {
      const frame = current();
      if (!frame.id && !frame.nearestId) frame.nearestId = id;
    }
  }

  const tail = clean.slice(scanPos);
  if (tail) appendText(current(), decodeEntities(tail));

  // Close any frames left open by malformed HTML.
  while (stack.length > 1) closeFrame();

  return finalizeFrame(root);
}

function appendText(frame: BlockFrame, text: string): void {
  if (!text) return;
  frame.text += text;
  if (text.trim()) frame.hasInlineContent = true;
}

/**
 * Finalize a frame into EpubBlock[]. Frames that contain nested block frames
 * only contribute their own text when they have direct inline content.
 * The text is trimmed (with link format offsets adjusted) and `[IMG:…]`
 * markers are split into standalone image blocks.
 */
function finalizeFrame(frame: BlockFrame): EpubBlock[] {
  const blocks: EpubBlock[] = [...frame.emitted];

  const ownHasContent = frame.hasInlineContent && frame.text.trim().length > 0;
  if (!ownHasContent) return blocks;

  const text = frame.text;
  const firstChar = text.search(/\S/);
  let lastChar = text.length;
  while (lastChar > firstChar && /\s/.test(text[lastChar - 1]!)) lastChar--;
  if (firstChar === -1 || lastChar <= firstChar) return blocks;

  const body = text.slice(firstChar, lastChar);
  const formats = frame.formats
    .filter((f) => f.end > firstChar && f.start < lastChar && f.end > f.start)
    .map((f) => ({
      start: Math.max(0, f.start - firstChar),
      end: Math.min(body.length, f.end - firstChar),
      type: 'link' as const,
      url: f.url,
    }));

  const type = frame.type === 'heading' || frame.type === 'list-item' || frame.type === 'blockquote' || frame.type === 'pre'
    ? frame.type
    : 'paragraph';
  const srcElementId = frame.id ?? frame.nearestId;

  // Split on image markers so images keep their position in the flow.
  let cursor = 0;
  let markerOffset = 0;
  IMG_MARKER_RE.lastIndex = 0;
  let imgMatch: RegExpExecArray | null;
  while ((imgMatch = IMG_MARKER_RE.exec(body)) !== null) {
    const seg = body.slice(cursor, imgMatch.index);
    if (seg.trim()) {
      blocks.push(makeTextBlock(type, frame.depth, seg, srcElementId, formats, markerOffset));
    }
    blocks.push({ kind: 'image', uri: imgMatch[1]! });
    markerOffset += imgMatch[0].length;
    cursor = imgMatch.index + imgMatch[0].length;
  }
  const rest = body.slice(cursor);
  if (rest.trim()) {
    blocks.push(makeTextBlock(type, frame.depth, rest, srcElementId, formats, markerOffset));
  }

  return blocks;
}

function makeTextBlock(
  type: EpubTextBlock['type'],
  depth: number | undefined,
  text: string,
  srcElementId: string | undefined,
  formats: EpubFormatRange[],
  markerOffset: number,
): EpubTextBlock {
  const block: EpubTextBlock = { kind: 'text', type, text };
  if (type === 'heading') block.depth = depth ?? 1;
  if (srcElementId) block.srcElementId = srcElementId;
  const adjusted = formats
    .map((f) => ({ ...f, start: f.start - markerOffset, end: f.end - markerOffset }))
    .filter((f) => f.start >= 0 && f.end <= text.length && f.end > f.start);
  if (adjusted.length > 0) block.formats = adjusted;
  return block;
}
