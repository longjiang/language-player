import {
  htmlToMarkdown,
  parseMarkdownBlocks,
  type ContentBlock,
  type FormatRange,
} from '@langplayer/shared';
import { splitInlineImageBlocks } from '@/lib/parse-markdown';

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

/**
 * Inline format range mapped onto a text block's characters (SPEC-049 §9.7).
 * Alias of the shared markdown FormatRange (SPEC-083) — adds `strikethrough`
 * to the legacy mobile union so both apps share one format model.
 */
export type EpubFormatRange = FormatRange;

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
  /** SPEC-082 Task 5: first block of a spine item — a hard page start. */
  startsNewSpine?: boolean;
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

  return { spine, toc, coverBase64, coverItemId, opfDir, title, author };
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
//
// SPEC-083 single pipeline: EPUB chapter HTML → markdown → shared blocks.
// The chapter HTML is converted by the shared htmlToMarkdown (with
// preserveIds anchors so `#fragment` TOC entries keep resolving, and
// resolveImage so archive images become local file:// URIs), then parsed by
// the shared parseMarkdownBlocks. This replaces the legacy native frame
// walker; inline formatting (bold/italic/code/link) now survives via
// markdown, which the old converter dropped (links only).

/** Normalize a fragment id for comparison (percent-decoding, best effort). */
export function normalizeFragmentId(id: string): string {
  try { return decodeURIComponent(id); } catch { return id; }
}

/**
 * Convert an EPUB content document's HTML into shared content blocks.
 *
 * Keeps the SPEC-049 §9.1 contract: each block records the source element id
 * (own or nearest ancestor) as `srcElementId` so `#fragment` TOC entries and
 * internal links resolve precisely, and `<a href>` ranges survive as link
 * formats (§9.7). Images are resolved through `resolveImage` and emitted as
 * standalone image blocks.
 */
export function convertHtmlToBlocks(
  html: string,
  contentDir: string,
  resolveImage: (resolvedPath: string) => string | null,
): ContentBlock[] {
  const md = htmlToMarkdown(html, `epub://${contentDir}/`, {
    preserveIds: true,
    resolveImage: (src) => {
      if (src.includes('://') || src.startsWith('data:')) return null;
      return resolveImage(resolvePath(contentDir, src));
    },
  });
  // Mobile native inline-image drawing isn't implemented yet (SPEC-087 §2
  // gap), so split text+inline-image blocks back into adjacent text /
  // standalone image blocks so the EPUB reader keeps showing the image.
  return splitInlineImageBlocks(parseMarkdownBlocks(md, { preserveIds: true }));
}
