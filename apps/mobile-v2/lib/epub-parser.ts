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
 */
export function parseOPF(opfXml: string, ncxXml?: string): EpubMetadata {
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

  // OPF directory for resolving relative hrefs
  const opfDirMatch = opfXml.match(/opf:file-as="([^"]*)"/);
  const opfDir = '';

  const spine: { href: string; title: string }[] = [];
  for (const idref of idrefs) {
    const href = manifest.get(idref);
    if (href) spine.push({ href: resolvePath(opfDir, href), title: '' });
  }

  // Cover image: <meta name="cover" content="X" />
  let coverBase64: string | null = null;
  const coverMetaMatch = opfXml.match(/<meta\b[^>]*name="cover"[^>]*content="([^"]+)"/);
  if (coverMetaMatch) {
    const coverId = coverMetaMatch[1]!;
    const coverHrefMatch = opfXml.match(
      new RegExp(`<item\\b[^>]*id="${coverId}"[^>]*href="([^"]+)"`),
    );
    if (coverHrefMatch) {
      coverBase64 = coverHrefMatch[1]!; // Resolved later
    }
  }

  // TOC from NCX: <navMap> → <navPoint> → <navLabel><text> + <content src="X" />
  const toc = ncxXml ? parseNCX(ncxXml, manifest, opfDir) : [];

  return { spine, toc, coverBase64, opfDir };
}

/** Parse NCX file into recursive TocItem[]. */
function parseNCX(
  ncxXml: string,
  manifest: Map<string, string>,
  opfDir: string,
): TocItem[] {
  // <navPoint id="X" playOrder="1"> → <navLabel><text>Ch1</text></navLabel> → <content src="X.xhtml" />
  const points = ncxXml.match(/<navPoint\b[^>]*>[\s\S]*?<\/navPoint>/g);
  return (points ?? []).map((np) => {
    const labelMatch = np.match(/<navLabel>[\s\S]*?<text>([^<]+)<\/text>/);
    const srcMatch = np.match(/<content\b[^>]*src="([^"]+)"/);
    const label = labelMatch?.[1]?.trim() ?? 'Untitled';
    const src = srcMatch?.[1] ?? '';
    // Resolve href through manifest, fallback to direct src path
    const itemId = src.replace('#', '');
    const href = manifest.get(itemId) ?? resolvePath(opfDir, src);
    return { label, href };
  });
}

/** Resolve a relative path against the OPF directory. */
export function resolvePath(base: string, href: string): string {
  if (href.startsWith('/') || href.includes('://')) return href;
  return base + href;
}
