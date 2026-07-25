import { useState, useCallback, useRef, useEffect } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import JSZip from 'jszip';
import { parseOPF } from '@/lib/epub-parser';
import type { TocItem } from '@/lib/epub-parser';

const STORAGE_PATH = FileSystem.documentDirectory + 'epub_state.json';

interface StoredEpubState {
  fileName: string;
  fileUri: string;
  chapterHref: string | null;
}

export interface UseEpubReturn {
  fileName: string | null;
  bookTitle: string | null;
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
  pickFile: () => Promise<void>;
  loadChapter: (href: string) => Promise<string>;
  prevChapter: () => void;
  nextChapter: () => void;
  close: () => void;
  openFromCover: () => void;
}

function flattenToc(items: TocItem[]): TocItem[] {
  const r: TocItem[] = [];
  for (const i of items) { r.push(i); if (i.children) r.push(...flattenToc(i.children)); }
  return r;
}

export function useEpub(onChapterChange?: (text: string, title: string) => void): UseEpubReturn {
  const [fileName, setFileName] = useState<string | null>(null);
  const [bookTitle, setBookTitle] = useState<string | null>(null);
  const [toc, setToc] = useState<TocItem[]>([]);
  const [chapterTitle, setChapterTitle] = useState<string | null>(null);
  const [chapterHref, setChapterHref] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [coverTapped, setCoverTapped] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const zipRef = useRef<any>(null);
  const spineRef = useRef<{ href: string; title: string }[]>([]);
  const cacheRef = useRef<Map<string, string>>(new Map());
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

  // Restore
  useEffect(() => {
    (async () => {
      try {
        const info = await FileSystem.getInfoAsync(STORAGE_PATH);
        if (!info.exists) { setRestoring(false); return; }
        const json = await FileSystem.readAsStringAsync(STORAGE_PATH);
        const st: StoredEpubState = JSON.parse(json);
        const fileInfo = await FileSystem.getInfoAsync(st.fileUri);
        if (!fileInfo.exists) { setRestoring(false); return; }

        storedRef.current = st;
        setFileName(st.fileName);
        setRestoring(false);
        await loadFromUri(st.fileUri);
        if (st.chapterHref) {
          const text = await loadChapterContent(st.chapterHref);
          setChapterHref(st.chapterHref);
          const entry = flatTocRef.current.find((t) => t.href === st.chapterHref);
          setChapterTitle(entry?.label ?? '');
          setCoverTapped(true);
          onChapterChange?.(text, entry?.label ?? '');
        }
      } catch (e: any) { setError(e?.message ?? String(e)); }
      setRestoring(false);
    })();
    return () => setRestoring(false);
  }, []);

  // Core: load EPUB from URI
  const loadFromUri = useCallback(async (uri: string) => {
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    const zip = await JSZip.loadAsync(base64, { base64: true });
    zipRef.current = zip;

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

    // Build manifest map for nav/NCX lookups
    const manifestItems = new Map<string, { id: string; href: string; props?: string }>();
    const itemRegex = /<item\b([^>]*)>/g;
    let itemMatch: RegExpExecArray | null;
    while ((itemMatch = itemRegex.exec(opfXml)) !== null) {
      const a = itemMatch[1]!;
      const id = a.match(/id="([^"]+)"/)?.[1];
      const href = a.match(/href="([^"]+)"/)?.[1];
      const props = a.match(/properties="([^"]+)"/)?.[1];
      if (id && href) manifestItems.set(id, { id, href, props });
    }

    // Try to load EPUB 3 nav document (item with properties="nav")
    let navXml: string | undefined;
    let navDir: string | undefined;
    for (const [, item] of manifestItems) {
      if (item.props?.split(/\s+/).includes('nav')) {
        const navFile = zip.file(resolvePathFn(opfDir, item.href));
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
        const ncxFile = zip.file(resolvePathFn(opfDir, ncxItem.href));
        if (ncxFile) ncxXml = await ncxFile.async('text');
      }
    }

    const meta = parseOPF(opfXml, opfDir, ncxXml, navXml, navDir);
    spineRef.current = meta.spine;

    // Book title
    setBookTitle(meta.title);

    // Cover image
    if (meta.coverBase64) {
      const cf = zip.file(resolvePathFn(opfDir, meta.coverBase64));
      if (cf) setCoverUrl('data:image/jpeg;base64,' + await cf.async('base64'));
    }

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
    const html: string = await file.async('text');
    const text = html
      .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '').replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
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
      await persist({ fileName: asset.name, fileUri: permUri, chapterHref: null });
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
      if (storedRef.current) persist({ ...storedRef.current, chapterHref: cleanHref });
      return combinedText;
    } finally { setLoading(false); }
  }, [loadChapterContent, onChapterChange, persist]);

  const openFromCover = useCallback(async () => {
    if (spineRef.current.length === 0) return;
    // Use loadChapter for spine concatenation (covers, frontmatter → first chapter)
    await loadChapter(spineRef.current[0]!.href);
  }, [loadChapter]);

  const prevChapter = useCallback(() => { if (prevHref) loadChapter(prevHref); }, [prevHref, loadChapter]);
  const nextChapter = useCallback(() => { if (nextHref) loadChapter(nextHref); }, [nextHref, loadChapter]);

  const close = useCallback(() => {
    zipRef.current = null; spineRef.current = []; cacheRef.current.clear();
    setFileName(null); setBookTitle(null); setToc([]); setChapterTitle(null); setChapterHref(null);
    setCoverUrl(null); setCoverTapped(false); setError(null);
    persist(null);
  }, [persist]);

  return {
    fileName: restoring && storedRef.current ? storedRef.current.fileName : fileName,
    bookTitle,
    toc, chapterTitle,
    chapterHref: restoring && storedRef.current ? storedRef.current.chapterHref : chapterHref,
    loading: loading || restoring,
    coverUrl, coverTapped,
    flatToc, prevHref, nextHref, error,
    pickFile, loadChapter, prevChapter, nextChapter, close, openFromCover,
  };
}

function resolvePathFn(base: string, href: string): string {
  if (href.startsWith('/') || href.includes('://')) return href;
  return base + href;
}
