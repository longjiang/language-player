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

  const flatToc = flattenToc(toc);
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
          setChapterTitle(spineRef.current.find((s) => s.href === st.chapterHref)?.title ?? '');
          setCoverTapped(true);
          onChapterChange?.(text, spineRef.current.find((s) => s.href === st.chapterHref)?.title ?? '');
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

    // Try to load NCX for TOC
    const ncxMatch = opfXml.match(/<item\b[^>]*id="ncx"[^>]*href="([^"]+)"/);
    let ncxXml: string | undefined;
    if (ncxMatch) {
      const ncxFile = zip.file(resolvePathFn(opfDir, ncxMatch[1]!));
      if (ncxFile) ncxXml = await ncxFile.async('text');
    }

    const meta = parseOPF(opfXml, opfDir, ncxXml);
    spineRef.current = meta.spine;

    // Cover image
    if (meta.coverBase64) {
      const cf = zip.file(resolvePathFn(opfDir, meta.coverBase64));
      if (cf) setCoverUrl('data:image/jpeg;base64,' + await cf.async('base64'));
    }

    // TOC — prefer NCX, fallback to spine map
    setToc(meta.toc.length > 0 ? meta.toc : meta.spine.map((s, idx) => ({
      label: s.title || `Chapter ${idx + 1}`, href: s.href,
    })));
  }, []);

  const loadChapterContent = useCallback(async (href: string): Promise<string> => {
    if (cacheRef.current.has(href)) return cacheRef.current.get(href)!;
    const zip = zipRef.current; if (!zip) return '';
    const file = zip.file(href); if (!file) return '';
    const html: string = await file.async('text');
    const text = html
      .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '').replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n').replace(/<\/h[1-6]>/gi, '\n\n')
      .replace(/<\/div>/gi, '\n').replace(/<\/li>/gi, '\n').replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\n{3,}/g, '\n\n').trim();
    cacheRef.current.set(href, text);
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

  const openFromCover = useCallback(async () => {
    if (spineRef.current.length === 0) return;
    const first = spineRef.current[0]!;
    setLoading(true);
    try {
      const text = await loadChapterContent(first.href);
      setCoverTapped(true);
      setChapterHref(first.href);
      setChapterTitle(first.title || 'Chapter 1');
      onChapterChange?.(text, first.title || 'Chapter 1');
      if (storedRef.current) persist({ ...storedRef.current, chapterHref: first.href });
    } catch (e: any) { setError(e?.message ?? String(e)); }
    finally { setLoading(false); }
  }, [loadChapterContent, onChapterChange, persist]);

  const loadChapter = useCallback(async (href: string): Promise<string> => {
    setLoading(true);
    try {
      const text = await loadChapterContent(href);
      const entry = spineRef.current.find((s) => s.href === href);
      setCoverTapped(true);
      setChapterTitle(entry?.title || '');
      setChapterHref(href);
      onChapterChange?.(text, entry?.title || '');
      if (storedRef.current) persist({ ...storedRef.current, chapterHref: href });
      return text;
    } finally { setLoading(false); }
  }, [loadChapterContent, onChapterChange, persist]);

  const prevChapter = useCallback(() => { if (prevHref) loadChapter(prevHref); }, [prevHref, loadChapter]);
  const nextChapter = useCallback(() => { if (nextHref) loadChapter(nextHref); }, [nextHref, loadChapter]);

  const close = useCallback(() => {
    zipRef.current = null; spineRef.current = []; cacheRef.current.clear();
    setFileName(null); setToc([]); setChapterTitle(null); setChapterHref(null);
    setCoverUrl(null); setCoverTapped(false); setError(null);
    persist(null);
  }, [persist]);

  return {
    fileName: restoring && storedRef.current ? storedRef.current.fileName : fileName,
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
