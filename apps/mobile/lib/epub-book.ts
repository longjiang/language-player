import * as FileSystem from 'expo-file-system/legacy';
import { File } from 'expo-file-system';
import JSZip from 'jszip';
import {
  parseOPF,
  resolvePath,
  convertHtmlToBlocks,
  normalizeFragmentId,
  type TocItem,
  type EpubManifestItem,
} from '@/lib/epub-parser';
import type { ContentBlock, TextBlock, ImageBlock } from '@/lib/parse-markdown';
import { log } from '@/lib/logger';

/** A position in the whole-book block stream (SPEC-049 §9.1). */
export interface BookLocation {
  /** Global block index across all linear spine items. */
  blockIndex: number;
  /** Character offset within the block's text (always 0 for TOC/link jumps). */
  offset: number;
}

/** A flattened TOC entry resolved to its location in the book flow. */
export interface TocMarker {
  label: string;
  href: string;
  location: BookLocation;
}

/** Per-spine conversion result used for fragment resolution + progress. */
interface SpineData {
  href: string;
  blocks: ContentBlock[];
  /** Global block index where this spine item's blocks begin. */
  globalStart: number;
}

export interface EpubBookModel {
  fileName: string;
  title: string;
  author: string;
  toc: TocItem[];
  markers: TocMarker[];
  /** Whole-book flow: every linear spine item's blocks, in spine order. */
  blocks: ContentBlock[];
  /** Plain-text length of each global block (images/whitespace = 0). */
  blockLengths: number[];
  totalChars: number;
  /** Canonical zip paths of the spine items (for internal link resolution). */
  spineHrefs: string[];
  coverUrl: string | null;
  /** Nearest preceding TOC label per block range (for search results). */
  chapterLabels: { blockIndex: number; label: string }[];
  /** Prefix sums of blockLengths — chars read before a block index. */
  prefixChars: number[];
  close: () => Promise<void>;
  resolveHref: (href: string, fromHref?: string) => Promise<BookLocation | null>;
}

/** Recursively add a directory's files into a JSZip instance. */
async function addDirectoryToZip(zip: JSZip, dirUri: string, prefix: string): Promise<void> {
  const entries = await FileSystem.readDirectoryAsync(dirUri);
  for (const name of entries) {
    const full = `${dirUri}${name}`;
    const rel = prefix ? `${prefix}/${name}` : name;
    const info = await FileSystem.getInfoAsync(full);
    if (info.isDirectory) {
      await addDirectoryToZip(zip, `${full}/`, rel);
    } else {
      const b64 = await FileSystem.readAsStringAsync(full, {
        encoding: FileSystem.EncodingType.Base64,
      });
      zip.file(rel, b64, { base64: true });
    }
  }
}

interface OpenOptions {
  /** Existing persisted cover file:// URI to reuse (bookshelf covers). */
  coverUri?: string | null;
}

const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

/** Stable per-file id: sanitized file name (re-uploading updates the handle). */
export function sanitizeEpubId(fileName: string): string {
  const base = fileName.replace(/\.epub$/i, '').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80);
  return (base || 'book') + '.epub';
}

/**
 * Normalize a `.epub.zip` / `.zip` archive that wraps an EPUB into a real
 * EPUB file at `destUri`.
 *
 * Three common shapes are handled:
 * - the archive already IS an EPUB (container at root) — bytes are fine as-is
 * - the archive contains a single inner `.epub` file — extract it
 * - the archive contains the EPUB's extracted folder — rezip it with the
 *   folder as root
 *
 * Returns the display file name to use, or null when the zip doesn't contain
 * an EPUB. Non-zip names pass through unchanged.
 */
export async function unwrapEpubZipFile(
  fileUri: string,
  fileName: string,
  destUri: string,
): Promise<string | null> {
  if (!/\.(epub\.)?zip$/i.test(fileName)) return fileName;

  let zip: JSZip;
  try {
    const data = await new File(fileUri).arrayBuffer();
    zip = await JSZip.loadAsync(data);
  } catch {
    return null;
  }

  const entries = Object.values(zip.files).filter((f) => !f.dir);
  const baseName = fileName.replace(/\.epub\.zip$/i, '').replace(/\.zip$/i, '') + '.epub';

  // Already an EPUB archive (META-INF/container.xml at the zip root).
  if (zip.file('META-INF/container.xml')) {
    return baseName;
  }

  // Zip wraps a single .epub file.
  const innerEpubs = entries.filter((f) => /\.epub$/i.test(f.name));
  if (innerEpubs.length === 1) {
    const epub = innerEpubs[0]!;
    const b64 = await epub.async('base64');
    await FileSystem.writeAsStringAsync(destUri, b64, { encoding: FileSystem.EncodingType.Base64 });
    return epub.name.split('/').pop()!;
  }

  // Zip contains the extracted EPUB folder (container.xml nested under a
  // top-level folder) — rezip with the folder stripped from every path.
  const container = entries.find((f) => /(^|\/)META-INF\/container\.xml$/i.test(f.name));
  if (container) {
    const prefix = container.name.replace(/META-INF\/container\.xml$/i, '');
    const rezip = new JSZip();
    for (const f of entries) {
      if (f.name.startsWith('__MACOSX/')) continue;
      const rel = f.name.startsWith(prefix) ? f.name.slice(prefix.length) : f.name;
      if (!rel) continue;
      const b64 = await f.async('base64');
      if (rel === 'mimetype') {
        rezip.file(rel, b64, { base64: true, compression: 'STORE' });
      } else {
        rezip.file(rel, b64, { base64: true });
      }
    }
    const out = await rezip.generateAsync({
      type: 'base64',
      compression: 'DEFLATE',
      mimeType: 'application/epub+zip',
    });
    await FileSystem.writeAsStringAsync(destUri, out, { encoding: FileSystem.EncodingType.Base64 });
    return baseName;
  }

  return null;
}

/** Flatten a TOC tree into document-order entries. */
function flattenToc(items: TocItem[]): TocItem[] {
  const out: TocItem[] = [];
  for (const item of items) {
    out.push(item);
    if (item.children) out.push(...flattenToc(item.children));
  }
  return out;
}

/**
 * Open an EPUB file and build the whole-book model (SPEC-049 §9.1):
 * spine = reading flow, TOC = bookmarks resolved to block locations, and
 * every content document converted once into a global block stream.
 */
export async function openEpubBook(
  fileUri: string,
  fileName: string,
  opts: OpenOptions = {},
): Promise<EpubBookModel> {
  const t0 = Date.now();
  // Some books arrive as unzipped EPUB directories (e.g. older files from
  // Dropbox/Calibre). Build an in-memory JSZip from the directory so the rest
  // of the model code is identical for both forms.
  const info = await FileSystem.getInfoAsync(fileUri);
  const isDirectory = !!info.isDirectory;
  let zip: JSZip;
  if (isDirectory) {
    zip = new JSZip();
    await addDirectoryToZip(zip, fileUri.endsWith('/') ? fileUri : `${fileUri}/`, '');
  } else {
    // Read the archive as binary (not base64) — base64 expands the file 33%
    // and can make JSZip hang or freeze the JS thread on large books.
    const data = await new File(fileUri).arrayBuffer();
    zip = await JSZip.loadAsync(data);
    log(`[LP Mobile] ⏱️ epub open "${fileName}": unzip ${Date.now() - t0}ms (isDirectory=${isDirectory})`);
  }
  const id = sanitizeEpubId(fileName);
  const tempDir = `${FileSystem.cacheDirectory}epub_tmp_${id}/`;
  try { await FileSystem.makeDirectoryAsync(tempDir, { intermediates: true }); } catch { /* exists */ }

  const containerFile = zip.file('META-INF/container.xml');
  if (!containerFile) throw new Error('Invalid EPUB: no container.xml');
  const containerXml = await containerFile.async('text');
  const rootfileMatch = containerXml.match(/full-path="([^"]+)"/);
  if (!rootfileMatch) throw new Error('Invalid EPUB: no rootfile');

  const opfPath = rootfileMatch[1]!;
  const opfDir = opfPath.substring(0, opfPath.lastIndexOf('/') + 1);
  const opfFile = zip.file(opfPath);
  if (!opfFile) throw new Error('OPF not found');
  const opfXml = await opfFile.async('text');

  // Manifest map for nav/NCX lookups + image extraction.
  const manifestItems = new Map<string, EpubManifestItem>();
  const itemRegex = /<item\b([^>]*)>/g;
  let itemMatch: RegExpExecArray | null;
  while ((itemMatch = itemRegex.exec(opfXml)) !== null) {
    const a = itemMatch[1]!;
    const idAttr = a.match(/id="([^"]+)"/)?.[1];
    const href = a.match(/href="([^"]+)"/)?.[1];
    const mediaType = a.match(/media-type="([^"]+)"/)?.[1];
    const props = a.match(/properties="([^"]+)"/)?.[1];
    if (idAttr && href) manifestItems.set(idAttr, { id: idAttr, href, mediaType, props });
  }

  // Nav document (EPUB 3) with its own directory, then NCX (EPUB 2).
  let navXml: string | undefined;
  let navDir: string | undefined;
  for (const [, item] of manifestItems) {
    if (item.props?.split(/\s+/).includes('nav')) {
      const navFile = zip.file(resolvePath(opfDir, item.href));
      if (navFile) {
        navXml = await navFile.async('text');
        navDir = opfDir + item.href.substring(0, item.href.lastIndexOf('/') + 1);
      }
      break;
    }
  }
  let ncxXml: string | undefined;
  if (!navXml) {
    const ncxItem = [...manifestItems.values()].find(
      (item) => item.id === 'ncx' || item.href.endsWith('.ncx'),
    );
    if (ncxItem) {
      const ncxFile = zip.file(resolvePath(opfDir, ncxItem.href));
      if (ncxFile) ncxXml = await ncxFile.async('text');
    }
  }

  const meta = parseOPF(opfXml, opfDir, ncxXml, navXml, navDir);
  const toc = meta.toc.length > 0 ? meta.toc : meta.spine.map((s, idx) => ({
    label: s.title || `Chapter ${idx + 1}`,
    href: s.href,
  }));

  // Extract images once per open (RN Image needs file:// URIs).
  const imageCache = new Map<string, string>();
  let imgIdx = 0;
  const tempPaths: string[] = [];
  const tImg = Date.now();
  for (const [, item] of manifestItems) {
    if (item.mediaType && IMAGE_MIME_TYPES.includes(item.mediaType)) {
      const resolvedPath = resolvePath(opfDir, item.href);
      const imgFile = zip.file(resolvedPath);
      if (imgFile) {
        try {
          const b64 = await imgFile.async('base64');
          const ext = ((item.mediaType.split('/')[1] || 'jpg') as string).replace('jpeg', 'jpg');
          const imgPath = `${tempDir}img_${imgIdx++}.${ext}`;
          await FileSystem.writeAsStringAsync(imgPath, b64, { encoding: FileSystem.EncodingType.Base64 });
          // tempDir is already a file:// URI (cacheDirectory) — store it as-is
          // for RN Image. Prepending 'file://' again yields an unloadable
          // `file://file:///…` URI (book covers were broken by exactly this).
          imageCache.set(resolvedPath, imgPath);
          tempPaths.push(imgPath);
        } catch { /* skip corrupt images */ }
      }
    }
  }
  log(`[LP Mobile] ⏱️ epub open "${fileName}": extracted ${imgIdx} images ${Date.now() - tImg}ms`);

  // Cover — reuse the persisted bookshelf cover when available.
  let coverUrl: string | null = opts.coverUri ?? null;
  if (!coverUrl && meta.coverBase64) {
    const resolvedPath = resolvePath(opfDir, meta.coverBase64);
    const cf = zip.file(resolvedPath);
    if (cf) {
      try {
        const coverItem = meta.coverItemId ? manifestItems.get(meta.coverItemId) : undefined;
        const mimeType = coverItem?.mediaType ?? 'image/jpeg';
        const b64 = await cf.async('base64');
        const ext = (mimeType.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
        const coverPath = `${tempDir}cover.${ext}`;
        await FileSystem.writeAsStringAsync(coverPath, b64, { encoding: FileSystem.EncodingType.Base64 });
        // tempDir is already a file:// URI — do not re-prefix (see image cache
        // comment above).
        coverUrl = coverPath;
        tempPaths.push(coverPath);
      } catch { /* generated cover fallback */ }
    }
  }

  // ── Convert every spine item once into the global block stream ──
  const tBlocks = Date.now();
  const spineData: SpineData[] = [];
  const blocks: ContentBlock[] = [];
  const blockLengths: number[] = [];
  let globalIndex = 0;
  for (const spine of meta.spine) {
    const file = zip.file(spine.href);
    const start = globalIndex;
    const converted: ContentBlock[] = [];
    if (file) {
      const html = await file.async('text');
      const contentDir = spine.href.substring(0, spine.href.lastIndexOf('/') + 1);
      // SPEC-083 single pipeline: chapter HTML -> markdown -> shared blocks.
      const raw = convertHtmlToBlocks(html, contentDir, (p) => imageCache.get(p) ?? null);
      for (const b of raw) {
        // SPEC-082 Task 5: the first block of each spine item is a hard page
        // start — chapters begin on a fresh page even if the block would fit.
        const startsNewSpine = globalIndex === start;
        const spineIndex = spineData.length;
        if (b.kind === 'text') {
          const tb: TextBlock = { ...b, spineIndex, startsNewSpine };
          converted.push(tb);
          blocks.push(tb);
          blockLengths.push(b.text.length);
          globalIndex++;
        } else if (b.kind === 'image') {
          const ib: ImageBlock = { kind: 'image', uri: b.uri, alt: b.alt, startsNewSpine };
          converted.push(ib);
          blocks.push(ib);
          blockLengths.push(0);
          globalIndex++;
        } else {
          // code / table / hr / html — pass through with spine metadata.
          converted.push(b);
          blocks.push(b);
          blockLengths.push(b.kind === 'code' ? b.text.length : 0);
          globalIndex++;
        }
      }
    }
    spineData.push({ href: spine.href, blocks: converted, globalStart: start });
  }

  // Prefix sums for progress (readChars before a block).
  const prefixChars: number[] = new Array(blockLengths.length);
  let acc = 0;
  for (let i = 0; i < blockLengths.length; i++) {
    prefixChars[i] = acc;
    acc += blockLengths[i]!;
  }
  const totalChars = acc;

  // ── Resolve TOC entries to locations (fragments included) ──
  const markers: TocMarker[] = [];
  for (const entry of flattenToc(toc)) {
    const location = resolveHrefInModel(entry.href, undefined, spineData);
    if (location) markers.push({ label: entry.label, href: entry.href, location });
  }
  markers.sort((a, b) => a.location.blockIndex - b.location.blockIndex);

  // Chapter label per block range: each marker labels blocks from its position
  // until the next marker (for whole-book search results).
  const chapterLabels = markers.map((m) => ({ blockIndex: m.location.blockIndex, label: m.label }));

  log(`[LP Mobile] 📖 EPUB open ${fileName}: ${meta.spine.length} spines, ${blocks.length} blocks, ${totalChars} chars, ${markers.length} TOC markers`);
  log(`[LP Mobile] ⏱️ epub open "${fileName}": spine→blocks ${Date.now() - tBlocks}ms, total ${Date.now() - t0}ms (unzip+parse+images+blocks)`);

  return {
    fileName,
    title: meta.title,
    author: meta.author,
    toc,
    markers,
    blocks,
    blockLengths,
    totalChars,
    spineHrefs: spineData.map((s) => s.href),
    coverUrl,
    chapterLabels,
    prefixChars,
    close: async () => {
      await Promise.allSettled(tempPaths.map((p) => FileSystem.deleteAsync(p)));
      try { await FileSystem.deleteAsync(tempDir); } catch { /* already gone */ }
    },
    resolveHref: async (href, fromHref) => resolveHrefInModel(href, fromHref, spineData),
  };
}

/** Canonicalize an in-book href (fragment kept) against a base document. */
function canonicalHref(href: string, fromHref?: string): string | null {
  const fragIdx = href.indexOf('#');
  const filePart = fragIdx === -1 ? href : href.slice(0, fragIdx);
  const frag = fragIdx === -1 ? '' : href.slice(fragIdx);
  if (!filePart) {
    if (!fromHref) return null;
    const baseFrag = fromHref.indexOf('#');
    return (baseFrag === -1 ? fromHref : fromHref.slice(0, baseFrag)) + frag;
  }
  if (filePart.includes('://')) return null; // external
  const base = fromHref ? fromHref.substring(0, fromHref.lastIndexOf('/') + 1) : '';
  return resolvePath(base, filePart) + frag;
}

function resolveHrefInModel(
  href: string,
  fromHref: string | undefined,
  spineData: SpineData[],
): BookLocation | null {
  const canonical = canonicalHref(href, fromHref);
  if (!canonical) return null;
  const fragIdx = canonical.indexOf('#');
  const filePart = fragIdx === -1 ? canonical : canonical.slice(0, fragIdx);
  const frag = fragIdx === -1 ? null : canonical.slice(fragIdx + 1);

  const si = spineData.findIndex((s) => s.href === filePart);
  if (si === -1) return null;
  const spine = spineData[si]!;
  if (frag) {
    const norm = normalizeFragmentId(frag);
    const local = spine.blocks.findIndex(
      (b) => b.kind === 'text' && b.srcElementId === norm,
    );
    return {
      blockIndex: spine.globalStart + (local === -1 ? 0 : local),
      offset: 0,
    };
  }
  return { blockIndex: spine.globalStart, offset: 0 };
}
