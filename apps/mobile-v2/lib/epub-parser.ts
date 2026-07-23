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
export function parseOPF(opfXml: string, opfDir: string, ncxXml?: string): EpubMetadata {
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
