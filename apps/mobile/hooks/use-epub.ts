import { useState, useCallback, useRef, useEffect } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import JSZip from 'jszip';
import { parseOPF, resolvePath } from '@/lib/epub-parser';
import type { TocItem, EpubManifestItem } from '@/lib/epub-parser';

const STORAGE_PATH = FileSystem.documentDirectory + 'epub_state.json';

interface StoredEpubState {
  fileName: string;
  fileUri: string;
  chapterHref: string | null;
  /** First ~40 chars of the first text block on the last-read page. */
  lastAnchor: string | null;
}

export interface UseEpubReturn {
  fileName: string | null;
  toc: TocItem[];
  chapterTitle: string | null;
  chapterHref: string | null;
  loading: boolean;
  coverUrl: string | null;
  coverTapped: boolean;
  flatToc: TocItem[];
  prevHref: string | null;
  nextHref: string | null;
  error: string | null;
  epubTitle: string;
  epubAuthor: string;
  pickFile: () => Promise<void>;
  loadChapter: (href: string) => Promise<string>;
  prevChapter: () => void;
  nextChapter: () => void;
  close: () => Promise<void>;
  openFromCover: () => void;
  /** First ~40 chars of the first text block on the last-read page (for position restore). */
  initialAnchor: string | null;
  /** Call when the user turns a page to persist their reading position. */
  saveAnchor: (anchor: string) => Promise<void>;
}

function flattenToc(items: TocItem[]): TocItem[] {
  const r: TocItem[] = [];
  for (const i of items) { r.push(i); if (i.children) r.push(...flattenToc(i.children)); }
  return r;
}

export function useEpub(onChapterChange?: (text: string, title: string) => void): UseEpubReturn {
  const [fileName, setFileName] = useState<string | null>(null);
  const [toc, setToc] = useState<TocItem[]>([]);
  const [chapterTitle, setChapterTitle] = useState<string | null>(null);
  const [chapterHref, setChapterHref] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [coverTapped, setCoverTapped] = useState(false);
  const [epubTitle, setEpubTitle] = useState('');
  const [epubAuthor, setEpubAuthor] = useState('');
  const [restoring, setRestoring] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const zipRef = useRef<any>(null);
  const spineRef = useRef<{ href: string; title: string }[]>([]);
  const cacheRef = useRef<Map<string, string>>(new Map());
  const imageCacheRef = useRef<Map<string, string>>(new Map());
  const storedRef = useRef<StoredEpubState | null>(null);
  const flatTocRef = useRef<TocItem[]>([]);

  const flatToc = flattenToc(toc);
  flatTocRef.current = flatToc;
  const i = chapterHref ? flatToc.findIndex((c) => c.href === chapterHref) : -1;
  const prevHref = i > 0 ? flatToc[i - 1]!.href : null;
  const nextHref = i >= 0 && i < flatToc.length - 1 ? flatToc[i + 1]!.href : null;

  // Persist
  const persist = useCallback(async (st: StoredEpubState | null) => {
    try {
      if (st) await FileSystem.writeAsStringAsync(STORAGE_PATH, JSON.stringify(st));
      else { try { await FileSystem.deleteAsync(STORAGE_PATH); } catch {} }
    } catch {}
  }, []);

  // Restore — runs exactly once on mount
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    (async () => {
      try {
        console.log('[epub:restore] checking', STORAGE_PATH);
        const info = await FileSystem.getInfoAsync(STORAGE_PATH);
        if (!info.exists) { console.log('[epub:restore] no persisted state'); setRestoring(false); return; }
        const json = await FileSystem.readAsStringAsync(STORAGE_PATH);
        const st: StoredEpubState = JSON.parse(json);
        console.log('[epub:restore] stored state:', JSON.stringify(st));
        const fileInfo = await FileSystem.getInfoAsync(st.fileUri);
        if (!fileInfo.exists) { console.log('[epub:restore] file gone:', st.fileUri); setRestoring(false); return; }

        storedRef.current = st;
        setFileName(st.fileName);
        // Don't set restoring false yet — wait until loadFromUri has set coverUrl
        await loadFromUri(st.fileUri);
        if (st.chapterHref) {
          console.log('[epub:restore] loading last chapter:', st.chapterHref);
          // Use loadChapter (not loadChapterContent) so spine concatenation
          // merges all content docs belonging to this logical chapter.
          await loadChapter(st.chapterHref);
        } else {
          console.log('[epub:restore] no chapterHref — showing cover');
        }
      } catch (e: any) { console.log('[epub:restore] error:', e?.message); setError(e?.message ?? String(e)); }
      setRestoring(false);
    })();
  }, []);

  // Core: load EPUB from URI
  const loadFromUri = useCallback(async (uri: string) => {
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    const zip = await JSZip.loadAsync(base64, { base64: true });
    zipRef.current = zip;
    // Clear stale content from any previously loaded EPUB
    cacheRef.current.clear();

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

    // Build manifest map for nav/NCX lookups + image extraction
    const manifestItems = new Map<string, EpubManifestItem>();
    const itemRegex = /<item\b([^>]*)>/g;
    let itemMatch: RegExpExecArray | null;
    while ((itemMatch = itemRegex.exec(opfXml)) !== null) {
      const a = itemMatch[1]!;
      const id = a.match(/id="([^"]+)"/)?.[1];
      const href = a.match(/href="([^"]+)"/)?.[1];
      const mediaType = a.match(/media-type="([^"]+)"/)?.[1];
      const props = a.match(/properties="([^"]+)"/)?.[1];
      if (id && href) manifestItems.set(id, { id, href, mediaType, props });
    }

    // Try to load EPUB 3 nav document (item with properties="nav")
    let navXml: string | undefined;
    let navDir: string | undefined;
    for (const [, item] of manifestItems) {
      if (item.props?.split(/\s+/).includes('nav')) {
        const navFile = zip.file(resolvePath(opfDir, item.href));
        if (navFile) {
          navXml = await navFile.async('text');
          // Compute directory of the nav doc so relative hrefs resolve correctly
          navDir = opfDir + item.href.substring(0, item.href.lastIndexOf('/') + 1);
        }
        break;
      }
    }

    // Try to load NCX for TOC (EPUB 2 fallback)
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
    spineRef.current = meta.spine;
    setEpubTitle(meta.title);
    setEpubAuthor(meta.author);

    // ── Build image cache from manifest — write images to temp files (RN Image needs file:// URIs) ──
    const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    imageCacheRef.current.clear();
    // Also track temp file paths for cleanup
    let imgIdx = 0;
    const tempImagePaths: string[] = [];
    for (const [, item] of manifestItems) {
      if (item.mediaType && IMAGE_MIME_TYPES.includes(item.mediaType)) {
        const resolvedPath = resolvePath(opfDir, item.href);
        const imgFile = zip.file(resolvedPath);
        if (imgFile) {
          try {
            const base64 = await imgFile.async('base64');
            const ext = ((item.mediaType.split('/')[1] || 'jpg') as string).replace('jpeg', 'jpg');
            const imgPath = FileSystem.documentDirectory + 'epub_img_' + (imgIdx++) + '.' + ext;
            await FileSystem.writeAsStringAsync(imgPath, base64, {
              encoding: FileSystem.EncodingType.Base64,
            });
            imageCacheRef.current.set(resolvedPath, 'file://' + imgPath);
            tempImagePaths.push(imgPath);
          } catch {
            // skip corrupt images
          }
        }
      }
    }
    // Store temp paths for cleanup (appended to existing ref in close)
    (imageCacheRef.current as any)._tempPaths = tempImagePaths;

    // ── Cover image — write to temp file (RN Image struggles with long data: URIs) ──
    if (meta.coverBase64) {
      const resolvedPath = resolvePath(opfDir, meta.coverBase64);
      const cf = zip.file(resolvedPath);
      if (cf) {
        try {
          const coverItem = meta.coverItemId ? manifestItems.get(meta.coverItemId) : undefined;
          const mimeType = coverItem?.mediaType ?? 'image/jpeg';
          const base64 = await cf.async('base64');
          const ext = (mimeType.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
          const coverPath = FileSystem.documentDirectory + 'epub_cover.' + ext;
          await FileSystem.writeAsStringAsync(coverPath, base64, {
            encoding: FileSystem.EncodingType.Base64,
          });
          // RN Image needs file:// prefix for local paths
          setCoverUrl('file://' + coverPath);
        } catch {
          // Cover extraction failed — leave coverUrl null for generated fallback
        }
      }
      // Cover href in metadata but file missing — leave coverUrl null for fallback
    }
    // No cover metadata — leave coverUrl null for fallback

    // TOC — nav doc or NCX already parsed, fallback to spine map
    setToc(meta.toc.length > 0 ? meta.toc : meta.spine.map((s, idx) => ({
      label: s.title || `Chapter ${idx + 1}`, href: s.href,
    })));
  }, []);

  const loadChapterContent = useCallback(async (href: string): Promise<string> => {
    // Strip fragment — zip entries never include #fragment
    const cleanHref = href.includes('#') ? href.split('#')[0]! : href;
    if (cacheRef.current.has(cleanHref)) return cacheRef.current.get(cleanHref)!;
    const zip = zipRef.current; if (!zip) return '';
    const file = zip.file(cleanHref); if (!file) return '';
    let html: string = await file.async('text');

    // ── Resolve <img> tags into [IMG:uri] markers before stripping HTML ──
    const contentDir = cleanHref.substring(0, cleanHref.lastIndexOf('/') + 1);
    html = html
      .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<img\b[^>]*\bsrc\s*=\s*(["'])([^"']+)\1[^>]*\/?>/gi, (_match, _quote: string, src: string) => {
        // Skip external URLs
        if (src.includes('://')) return '';
        // Resolve src relative to content doc directory, normalizing ../ segments
        const resolvedPath = resolvePath(contentDir, src);
        const dataUri = imageCacheRef.current.get(resolvedPath);
        return dataUri ? `[IMG:${dataUri}]` : '';
      });

    const text = html
      .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n').replace(/<\/h[1-6]>/gi, '\n\n')
      .replace(/<\/div>/gi, '\n').replace(/<\/li>/gi, '\n').replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\n{3,}/g, '\n\n').trim();
    cacheRef.current.set(cleanHref, text);
    return text;
  }, []);

  const pickFile = useCallback(async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/epub+zip', 'application/octet-stream'],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setLoading(true); setError(null);
    try {
      const permUri = FileSystem.documentDirectory + asset.name;
      await FileSystem.copyAsync({ from: asset.uri, to: permUri });
      await loadFromUri(permUri);
      setFileName(asset.name);
      const st: StoredEpubState = { fileName: asset.name, fileUri: permUri, chapterHref: null, lastAnchor: null };
      storedRef.current = st;
      await persist(st);
      // Don't auto-load — show cover first (matches Next.js)
    } catch (e: any) { setError(e?.message ?? String(e)); }
    finally { setLoading(false); }
  }, [loadFromUri, persist]);

  const loadChapter = useCallback(async (href: string): Promise<string> => {
    setLoading(true);
    try {
      const cleanHref = href.includes('#') ? href.split('#')[0]! : href;
      const spine = spineRef.current;
      const toc = flatTocRef.current;

      // Build a set of TOC hrefs (fragment-stripped) — these are chapter boundaries
      const tocHrefs = new Set(
        toc.map(t => (t.href.includes('#') ? t.href.split('#')[0]! : t.href)),
      );

      // Find where this TOC chapter starts in the spine
      const startIdx = spine.findIndex(s => s.href === cleanHref);

      // Find where the NEXT TOC chapter starts in the spine (end boundary)
      let endIdx = spine.findIndex(
        (s, i) => i > startIdx && tocHrefs.has(s.href),
      );
      if (endIdx === -1) endIdx = spine.length;

      // Concatenate all spine items belonging to this logical chapter
      let combinedText = '';
      for (let i = startIdx; i < endIdx; i++) {
        const text = await loadChapterContent(spine[i]!.href);
        if (text) combinedText += (combinedText ? '\n\n' : '') + text;
      }

      setCoverTapped(true);
      // Match TOC entry by comparing fragment-stripped hrefs
      const entry = toc.find(t => {
        const tHref = t.href.includes('#') ? t.href.split('#')[0]! : t.href;
        return tHref === cleanHref;
      });
      setChapterTitle(entry?.label ?? '');
      setChapterHref(cleanHref);
      onChapterChange?.(combinedText, entry?.label ?? '');
      if (storedRef.current) {
        // Update both storedRef and persist — storedRef is the live object
        // that saveAnchor reads from, so it must stay in sync with the file.
        storedRef.current = { ...storedRef.current, chapterHref: cleanHref };
        console.log('[epub:loadChapter] persist chapterHref:', cleanHref, 'storedRef:', JSON.stringify(storedRef.current));
        persist(storedRef.current);
      }
      return combinedText;
    } finally { setLoading(false); }
  }, [loadChapterContent, onChapterChange, persist]);

  const openFromCover = useCallback(async () => {
    if (spineRef.current.length === 0) return;
    await loadChapter(spineRef.current[0]!.href);
  }, [loadChapter]);

  const prevChapter = useCallback(() => { if (prevHref) loadChapter(prevHref); }, [prevHref, loadChapter]);
  const nextChapter = useCallback(() => { if (nextHref) loadChapter(nextHref); }, [nextHref, loadChapter]);

  const close = useCallback(async () => {
    // Clean up temp image files
    const tempPaths: string[] = (imageCacheRef.current as any)?._tempPaths ?? [];
    for (const p of tempPaths) {
      FileSystem.deleteAsync(p).catch(() => {});
    }
    // Clean up temp cover file
    if (coverUrl) {
      const coverPath = coverUrl.startsWith('file://') ? coverUrl.slice(7) : coverUrl;
      FileSystem.deleteAsync(coverPath).catch(() => {});
    }
    zipRef.current = null; spineRef.current = []; cacheRef.current.clear(); imageCacheRef.current.clear();
    storedRef.current = null;
    setFileName(null); setToc([]); setChapterTitle(null); setChapterHref(null);
    setCoverUrl(null); setCoverTapped(false); setError(null);
    setEpubTitle(''); setEpubAuthor('');
    await persist(null);
  }, [persist, coverUrl]);

  // ── Anchor: persist reading position within a chapter ──
  const saveAnchor = useCallback(async (anchor: string) => {
    if (!storedRef.current) return;
    const updated = { ...storedRef.current, lastAnchor: anchor };
    storedRef.current = updated;
    console.log('[epub:saveAnchor] anchor:', anchor.slice(0, 40), 'storedRef:', JSON.stringify(storedRef.current));
    await persist(updated);
  }, [persist]);

  return {
    fileName: restoring && storedRef.current ? storedRef.current.fileName : fileName,
    toc, chapterTitle,
    chapterHref: restoring && storedRef.current ? storedRef.current.chapterHref : chapterHref,
    loading: loading || restoring,
    coverUrl, coverTapped,
    flatToc, prevHref, nextHref, error,
    epubTitle, epubAuthor,
    initialAnchor: storedRef.current?.lastAnchor ?? null,
    saveAnchor,
    pickFile, loadChapter, prevChapter, nextChapter, close, openFromCover,
  };
}


