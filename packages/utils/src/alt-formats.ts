/**
 * Converters for "epub-like" book formats into a minimal content model:
 *  - FictionBook (.fb2): XML — title, TOC (ncx), sections of paragraphs.
 *  - MOBI (.mobi) / AZW3 (.azw3): PalmDOC-compressed PDB with HTML text
 *    records (MOBI6 section; AZW3 embeds the same structure). Huff/CDIC-
 *    compressed books (compression 17480) are not supported and are rejected.
 *
 * Both produce a normalized { title, toc, xhtml } that each app packs into a
 * minimal in-memory EPUB (jszip), so the existing epub book model handles the
 * rest (spine, pagination, search, position persistence). Pure TS — no DOM,
 * no Node APIs — so it lives in the shared package.
 */

export interface AltBookContent {
  title: string;
  author?: string;
  /** Flat TOC: label + a 1-based-ish anchor (the parser emits `#frag` ids). */
  toc: { label: string; href: string }[];
  /** XHTML body content (the book's text, paragraphs/sections). */
  xhtml: string;
}

// ── PalmDOC decompression (canonical algorithm per libmobi/calibre) ────────

/**
 * Decompress a PalmDOC (LZ77) stream. `textLength` is the uncompressed size
 * from the MOBI header; output stops there.
 */
export function decompressPalmDoc(input: Uint8Array, textLength: number): Uint8Array {
  const out: number[] = [];
  let pos = 0;
  while (out.length < textLength && pos < input.length) {
    const byte = input[pos]!;
    pos += 1;
    if (byte >= 0xc0) {
      // Byte pair: space + character.
      out.push(0x20);
      out.push(byte ^ 0x80);
    } else if (byte >= 0x80) {
      // Length/distance pair: distance 11 bits, length 3 bits + 3.
      const next = input[pos]!;
      pos += 1;
      const distance = (((byte << 8) | next) >> 3) & 0x7ff;
      const length = (next & 0x7) + 3;
      for (let i = 0; i < length; i++) {
        out.push(out[out.length - distance] ?? 0);
      }
    } else if (byte >= 0x09) {
      out.push(byte);
    } else if (byte >= 0x01) {
      for (let i = 0; i < byte; i++) {
        out.push(input[pos] ?? 0);
        pos += 1;
      }
    } else {
      out.push(0);
    }
  }
  return Uint8Array.from(out);
}

// ── MOBI / AZW3 container parsing ──────────────────────────────────────────

/**
 * Parse a MOBI/AZW3 PDB: read the MOBI header (record 0) and decompress the
 * text records into a single HTML string. Throws on unsupported compression
 * (HUFF/CDIC) or a malformed header.
 */
export function mobiToHtml(data: ArrayBuffer): { html: string; title?: string } {
  const bytes = new Uint8Array(data);
  const be32 = (o: number): number =>
    ((bytes[o] ?? 0) * 0x1000000) + ((bytes[o + 1] ?? 0) << 16) + ((bytes[o + 2] ?? 0) << 8) + (bytes[o + 3] ?? 0);
  const be16 = (o: number): number => ((bytes[o] ?? 0) << 8) + (bytes[o + 1] ?? 0);

  if (bytes.length < 78) throw new Error('Not a PDB file');
  const numRecords = be16(60);
  if (numRecords < 2) throw new Error('MOBI has no text records');

  // Record 0 = MOBI header.
  const mobiOffset = be32(78);
  if (mobiOffset <= 0 || mobiOffset >= bytes.length) throw new Error('MOBI header missing');
  const compression = be32(mobiOffset);
  const textLength = be32(mobiOffset + 8);
  const recordCount = be32(mobiOffset + 12);
  const recordSize = be32(mobiOffset + 16);
  const encryption = be32(mobiOffset + 20);
  const firstTextIndex = be32(mobiOffset + 84) || 1;

  if (compression !== 1 && compression !== 2) {
    throw new Error(`Unsupported MOBI compression (${compression}) — HUFF/CDIC books are not supported`);
  }
  if (encryption !== 0) throw new Error('Encrypted MOBI books are not supported');

  // Record info table (8 bytes per record starting at 78).
  const textRecords: Uint8Array[] = [];
  const endIndex = Math.min(numRecords, firstTextIndex + recordCount);
  for (let i = firstTextIndex; i < endIndex; i++) {
    const off = be32(78 + i * 8);
    const nextOff = i + 1 < numRecords ? be32(78 + (i + 1) * 8) : bytes.length;
    textRecords.push(bytes.slice(off, Math.max(off, Math.min(nextOff, bytes.length))));
  }

  let htmlBytes: Uint8Array;
  if (compression === 2) {
    const chunks: Uint8Array[] = [];
    let remaining = textLength;
    for (const rec of textRecords) {
      const want = Math.min(recordSize > 0 ? recordSize : 4096, remaining);
      const chunk = decompressPalmDoc(rec, want);
      chunks.push(chunk);
      remaining -= chunk.length;
      if (remaining <= 0) break;
    }
    htmlBytes = concatBytes(chunks);
  } else {
    htmlBytes = concatBytes(textRecords);
  }

  let html = '';
  try {
    html = new TextDecoder('utf-8').decode(htmlBytes);
  } catch {
    html = String.fromCharCode(...Array.from(htmlBytes.slice(0, 100000)));
  }

  // Best-effort title from the EXTH block (record 1 area) or the <title>.
  const titleMatch = /<title>([\s\S]*?)<\/title>/i.exec(html);
  return { html, title: titleMatch?.[1]?.trim() || undefined };
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

// ── MOBI HTML → readable XHTML ─────────────────────────────────────────────

/**
 * Strip scripts/styles/head and collapse the MOBI HTML body into a clean
 * XHTML fragment (the mobile/web epub readers then treat it as one spine doc).
 */
export function mobiHtmlToXhtml(html: string): { xhtml: string; toc: { label: string; href: string }[] } {
  const body = html
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<mbp:pagebreak[^>]*>/gi, '<br/>')
    .replace(/<\?xml[\s\S]*?\?>/g, '');

  // Best-effort TOC: use the guide's TOC page links when present, else
  // heading-level structure.
  const toc: { label: string; href: string }[] = [];
  const guideToc = /<guide>[\s\S]*?<reference\s+type="toc"([\s\S]*?)\/>/i.exec(body);
  const filepos = guideToc?.[1]?.match(/filepos=(\d+)/i)?.[1];
  if (filepos) {
    // Find the TOC page (the first heading after filepos in the body).
    const tocSection = body.slice(Number(filepos));
    const linkRe = /<a[^>]+href="#?([^"']+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let m: RegExpExecArray | null;
    while ((m = linkRe.exec(tocSection)) !== null && toc.length < 100) {
      const label = m[2]!.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim();
      if (label) toc.push({ label, href: `#${m[1]!.replace(/^#/, '')}` });
    }
  }
  if (toc.length === 0) {
    // Fallback: numbered headings become TOC entries.
    const headingRe = /<(h[1-6])([^>]*)>([\s\S]*?)<\/\1>/gi;
    let m: RegExpExecArray | null;
    while ((m = headingRe.exec(body)) !== null && toc.length < 100) {
      const label = m[3]!.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim();
      if (label) toc.push({ label, href: `#h${toc.length}` });
    }
  }

  return { xhtml: body, toc };
}

// ── FB2 parsing ────────────────────────────────────────────────────────────

/**
 * Parse a FictionBook XML document into { title, author, toc, xhtml }.
 */
export function parseFb2(xml: string): AltBookContent {
  const title =
    /<book-title>([\s\S]*?)<\/book-title>/i.exec(xml)?.[1]?.replace(/<[^>]+>/g, '').trim()
    || 'Untitled';
  const authorMatch = /<author>[\s\S]*?<first-name>([\s\S]*?)<\/first-name>[\s\S]*?<last-name>([\s\S]*?)<\/last-name>/i.exec(xml);
  const author = authorMatch
    ? `${authorMatch[1]!.replace(/<[^>]+>/g, '').trim()} ${authorMatch[2]!.replace(/<[^>]+>/g, '').trim()}`.trim()
    : undefined;

  // TOC from <ncx><navPoint> entries (hrefs like "#section-id").
  const toc: { label: string; href: string }[] = [];
  const ncxRe = /<navPoint[^>]*>[\s\S]*?<navLabel>[\s\S]*?<text>([\s\S]*?)<\/text>[\s\S]*?<\/navLabel>[\s\S]*?<content\s+src="([^"]*)"/gi;
  let m: RegExpExecArray | null;
  while ((m = ncxRe.exec(xml)) !== null) {
    const label = m[1]!.replace(/<[^>]+>/g, '').trim();
    if (label) toc.push({ label, href: m[2]!.startsWith('#') ? m[2]! : `#${m[2]!}` });
  }

  // Body: sections → <h2> titles, paragraphs → <p>. Preserve ids on sections.
  const bodyMatch = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(xml);
  const body = bodyMatch?.[1] ?? '';
  const xhtml = body
    .replace(/<section([^>]*)>/gi, (_all, attrs: string) => {
      const id = /id="([^"]*)"/i.exec(attrs)?.[1];
      return id ? `<section id="${id}">` : '<section>';
    })
    .replace(/<\/section>/gi, '</section>')
    .replace(/<title>/gi, '<h2>')
    .replace(/<\/title>/gi, '</h2>')
    .replace(/<subtitle>/gi, '<h3>')
    .replace(/<\/subtitle>/gi, '</h3>')
    .replace(/<p>/gi, '<p>')
    .replace(/<\/p>/gi, '</p>')
    .replace(/<empty-line\s*\/>/gi, '<br/>')
    .replace(/<strong>/gi, '<b>')
    .replace(/<\/strong>/gi, '</b>')
    .replace(/<emphasis>/gi, '<i>')
    .replace(/<\/emphasis>/gi, '</i>')
    .replace(/<image[^>]*\/>|<image[^>]*>[\s\S]*?<\/image>/gi, '')
    .replace(/<[a-z]+:binary[\s\S]*?<\/[a-z]+:binary>/gi, '');

  return { title, author, toc, xhtml };
}

/** Detect the format of an uploaded "book-like" file. */
export function detectAltBookFormat(data: ArrayBuffer, fileName: string): 'fb2' | 'mobi' | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.fb2')) return 'fb2';
  if (lower.endsWith('.mobi') || lower.endsWith('.azw3')) return 'mobi';
  // Magic-byte fallback (extension may be missing/misleading).
  const bytes = new Uint8Array(data.slice(0, 200));
  if (bytes.length >= 12 && (bytes[0] === 0x3c)) {
    const head = new TextDecoder().decode(bytes.slice(0, 200));
    if (/FictionBook/i.test(head)) return 'fb2';
  }
  if (bytes.length >= 68 && bytes[60] !== undefined && bytes[61] !== undefined) {
    const type = String.fromCharCode(bytes[32] ?? 0, bytes[33] ?? 0, bytes[34] ?? 0, bytes[35] ?? 0);
    const creator = String.fromCharCode(bytes[36] ?? 0, bytes[37] ?? 0, bytes[38] ?? 0, bytes[39] ?? 0);
    if ((type === 'BOOK' && creator === 'MOBI') || type === 'TEXt') return 'mobi';
  }
  return null;
}

/** Normalize any alt-format into the shared content model. */
export function convertAltBookFormat(
  data: ArrayBuffer,
  fileName: string,
): AltBookContent | null {
  const format = detectAltBookFormat(data, fileName);
  if (format === 'fb2') {
    const xml = new TextDecoder('utf-8').decode(data);
    return parseFb2(xml);
  }
  if (format === 'mobi') {
    const { html, title } = mobiToHtml(data);
    const { xhtml, toc } = mobiHtmlToXhtml(html);
    return { title: title ?? fileName.replace(/\.[^.]+$/, ''), toc, xhtml };
  }
  return null;
}

// ── Minimal EPUB packing ───────────────────────────────────────────────────

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Pack a normalized alt-format book into a minimal, valid EPUB 3 zip (one
 * spine document + a nav TOC), so the existing epub book model (epubjs on
 * web, the JSZip parser on mobile) handles the rest. All entries are stored
 * uncompressed so the mimetype stays STORE per the EPUB spec.
 */
export async function buildMinimalEpub(content: AltBookContent): Promise<ArrayBuffer> {
  const { default: JSZip } = await import('jszip');

  const title = content.title || 'Untitled';
  const tocItems = content.toc.slice(0, 200);
  const navLi = tocItems
    .map((t) => `<li><a href="text.xhtml${xmlEscape(t.href)}">${xmlEscape(t.label)}</a></li>`)
    .join('\n');
  const navDoc = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>${xmlEscape(title)}</title></head>
<body><nav epub:type="toc"><h1>${xmlEscape(title)}</h1><ol>${navLi}</ol></nav></body>
</html>`;

  const opf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">urn:uuid:alt-${Math.random().toString(36).slice(2, 12)}</dc:identifier>
    <dc:title>${xmlEscape(title)}</dc:title>
    ${content.author ? `<dc:creator>${xmlEscape(content.author)}</dc:creator>` : ''}
    <dc:language>und</dc:language>
    <meta property="dcterms:modified">2026-01-01T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="text" href="text.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine><itemref idref="text"/></spine>
</package>`;

  const container = `<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`;

  const textDoc = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>${xmlEscape(title)}</title></head>
<body>${content.xhtml || `<h1>${xmlEscape(title)}</h1>`}</body>
</html>`;

  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip');
  zip.file('META-INF/container.xml', container);
  zip.file('OEBPS/content.opf', opf);
  zip.file('OEBPS/nav.xhtml', navDoc);
  zip.file('OEBPS/text.xhtml', textDoc);
  const blob = await zip.generateAsync({
    type: 'arraybuffer',
    compression: 'STORE',
    mimeType: 'application/epub+zip',
  });
  return blob as ArrayBuffer;
}
