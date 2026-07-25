export interface TocItem {
  label: string;
  href: string;
  children?: TocItem[];
}

export interface EpubMetadata {
  spine: { href: string; title: string }[];
  toc: TocItem[];
  coverBase64: string | null;
  opfDir: string;
}

/** Extract one XML attribute value, e.g. extractAttr(attrs, 'id') → "c1" */
function extractAttr(attrsStr: string, name: string): string | undefined {
  const m = attrsStr.match(new RegExp(`${name}="([^"]+)"`));
  return m?.[1];
}

/**
 * Parse OPF file to extract manifest, spine, cover, and TOC.
 * All attribute extraction is order-independent.
 * Prefers nav document (EPUB 3) > NCX (EPUB 2) > spine fallback.
 */
export function parseOPF(
  opfXml: string,
  opfDir: string,
  ncxXml?: string,
  navXml?: string,
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

  // Cover image — attribute-order independent
  let coverBase64: string | null = null;
  const metaRegex = /<meta\b([^>]*)>/g;
  let mm: RegExpExecArray | null;
  while ((mm = metaRegex.exec(opfXml))) {
    if (extractAttr(mm[1]!, 'name') === 'cover') {
      const coverId = extractAttr(mm[1]!, 'content');
      if (coverId) {
        const itemRegex = /<item\b([^>]*)>/g;
        let im: RegExpExecArray | null;
        while ((im = itemRegex.exec(opfXml))) {
          if (extractAttr(im[1]!, 'id') === coverId) {
            coverBase64 = extractAttr(im[1]!, 'href') || null;
            break;
          }
        }
      }
      break;
    }
  }

  // TOC: prefer nav document (EPUB 3) > NCX (EPUB 2) > spine fallback
  let toc: TocItem[] = [];
  if (navXml) {
    toc = parseNavDocument(navXml, opfDir);
  }
  if (toc.length === 0 && ncxXml) {
    toc = parseNCX(ncxXml, manifest, opfDir);
  }

  return { spine, toc, coverBase64, opfDir };
}

// ── EPUB 3 nav document parser ──

/**
 * Parse EPUB 3 nav document (nav.xhtml) for nested TOC.
 * Looks for <nav epub:type="toc"> and extracts nested <ol>/<li>/<a>.
 */
function parseNavDocument(navHtml: string, opfDir: string): TocItem[] {
  const navMatch = navHtml.match(
    /<nav[^>]*epub:type\s*=\s*["']toc["'][^>]*>([\s\S]*?)<\/nav>/i,
  );
  if (!navMatch) return [];
  return parseNavList(navMatch[1]!, opfDir);
}

/**
 * Recursively parse <ol>/<li> structure from a nav document fragment.
 * Tracks <li> nesting depth by counting open/close tags.
 */
function parseNavList(html: string, opfDir: string): TocItem[] {
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
      const href = resolvePath(opfDir, aMatch[1]!);
      const label = aMatch[2]!.replace(/<[^>]+>/g, '').trim();
      // Check for nested <ol>
      const olContent = liContent.match(
        /<ol\b[^>]*>([\s\S]*?)<\/ol>/i,
      );
      const children = olContent
        ? parseNavList(olContent[1]!, opfDir)
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
    const itemId = src.replace('#', '');
    const href = manifest.get(itemId) ?? resolvePath(opfDir, src);

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

/** Resolve a relative path against the OPF directory. */
export function resolvePath(base: string, href: string): string {
  if (href.startsWith('/') || href.includes('://')) return href;
  return base + href;
}
