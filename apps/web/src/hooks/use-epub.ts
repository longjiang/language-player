/**
 * Hook for managing an EPUB book: load, parse, chapter navigation,
 * image resolution, ruby text, internal links, and IndexedDB persistence.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { saveEpub, loadEpub, updateEpubMeta, deleteEpub } from '@/lib/epub-store';
import type { TocItem } from '@/components/reader/epub-upload';

let _turndown: any = null;
async function getTurndown() {
  if (!_turndown) {
    const Turndown = (await import('turndown')).default;
    _turndown = new Turndown({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
  }
  return _turndown;
}

async function htmlToMarkdown(html: string): Promise<string> {
  const td = await getTurndown();
  return td.turndown(html);
}

export interface UseEpubReturn {
  /** The epubjs book instance. */
  book: any;
  /** Nested TOC items. */
  toc: TocItem[];
  /** Flat list of TOC items. */
  flatToc: TocItem[];
  /** Cover image data URL. */
  coverUrl: string | null;
  /** Whether the cover has been tapped. */
  coverTapped: boolean;
  /** Current chapter href. */
  chapterHref: string | null;
  /** Current chapter title. */
  chapterTitle: string | null;
  /** Previous chapter href. */
  prevHref: string | null;
  /** Next chapter href. */
  nextHref: string | null;
  /** File name of the loaded EPUB. */
  fileName: string | null;
  /** Loading state. */
  loading: boolean;
  /** Error message. */
  error: string | null;
  /** Set of spine item hrefs (for internal link interception). */
  chapterLinks: Set<string>;
  /** Page progression direction. */
  pageProgressionDir: 'ltr' | 'rtl';
  /** Load a file from an ArrayBuffer. */
  loadFile: (data: ArrayBuffer, fileName: string) => Promise<{
    flatToc: TocItem[];
    firstChapterHref: string | null;
  } | null>;
  /** Load a chapter by href. Returns the markdown text. */
  loadChapter: (href: string) => Promise<string>;
  /** Go to the next chapter. */
  nextChapter: () => Promise<void>;
  /** Go to the previous chapter. */
  prevChapter: () => Promise<void>;
  /** Close the book and clear state. */
  close: () => Promise<void>;
  /** Restore from IndexedDB (check on mount). Returns markdown + anchor. */
  restoreFromStorage: () => Promise<{ markdown: string; anchor: string | null } | null>;
  /** Update the last anchor in IndexedDB. */
  saveAnchor: (anchor: string) => Promise<void>;
}

export function useEpub(): UseEpubReturn {
  const [book, setBook] = useState<any>(null);
  const [toc, setToc] = useState<TocItem[]>([]);
  const [flatToc, setFlatToc] = useState<TocItem[]>([]);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [coverTapped, setCoverTapped] = useState(false);
  const [chapterHref, setChapterHref] = useState<string | null>(null);
  const [chapterTitle, setChapterTitle] = useState<string | null>(null);
  const [prevHref, setPrevHref] = useState<string | null>(null);
  const [nextHref, setNextHref] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chapterLinks, setChapterLinks] = useState<Set<string>>(new Set());
  const [pageProgressionDir, setPageProgressionDir] = useState<'ltr' | 'rtl'>('ltr');
  const bookRef = useRef<any>(null);

  /** Flatten nested TOC. */
  function flatten(items: TocItem[]): TocItem[] {
    const result: TocItem[] = [];
    for (const item of items) {
      result.push({ href: item.href, label: item.label });
      if (item.subitems?.length) result.push(...flatten(item.subitems));
    }
    return result;
  }

  /** Load a file. Returns the book instance for chaining. */
  const loadFile = useCallback(async (data: ArrayBuffer, fName: string): Promise<{
    flatToc: TocItem[];
    firstChapterHref: string | null;
  } | null> => {
    const ePubModule = await import('epubjs');
    const ePub = ePubModule.default;
    const b = ePub(data);
    bookRef.current = b;
    setBook(b);
    setFileName(fName);
    setCoverTapped(false);
    setCoverUrl(null);
    setError(null);

    try {
      const navigation = await b.loaded.navigation;
      const navToc = navigation.toc as TocItem[];
      setToc(navToc);
      setFlatToc(flatten(navToc));

      const cover = await b.coverUrl();
      setCoverUrl(cover ?? null);
      if (!cover) setCoverTapped(true);

      await saveEpub(data, fName);

      const flat = flatten(navToc);
      const firstHref = flat.length > 0 ? flat[0]!.href : null;

      // Load first chapter
      if (firstHref) {
        await b.ready;
        return { flatToc: flat, firstChapterHref: firstHref };
      }
      return { flatToc: flat, firstChapterHref: null };
    } catch (err) {
      console.error('Error loading EPUB:', err);
      setError('Failed to parse EPUB file');
    }
    return null;
  }, []);

  /** Load a chapter by href from the TOC. Concatenates all spine items belonging to this chapter. */
  const loadChapter = useCallback(async (href: string): Promise<string> => {
    const b = bookRef.current;
    if (!b) return '';
    setLoading(true);
    setChapterHref(href);
    setError(null);

    try {
      const spine = await b.loaded.spine;
      const cleanHref = href.split('#')[0];

      // Find which spine items belong to this TOC chapter.
      // A TOC chapter may span multiple spine items (e.g. a novel).
      // Classic approach: concatenate from this chapter's spine item
      // up to (but not including) the next TOC chapter's spine item.
      const tocHrefs = flatToc.map(t => t.href.split('#')[0]);
      const startIdx = (spine.items as any[]).findIndex((s: any) => s.href === cleanHref);
      let endIdx = (spine.items as any[]).findIndex(
        (s: any, i: number) => i > startIdx && tocHrefs.includes(s.href),
      );
      if (endIdx === -1) endIdx = (spine.items as any[]).length;

      // Concatenate HTML from all spine items in range
      let combinedHtml = '';
      for (let i = startIdx; i < endIdx; i++) {
        const spineItem = (spine.items as any[])[i]!;
        const item = spine.get(spineItem.href);
        if (item) {
          const contents = await item.load(b.load.bind(b));
          combinedHtml += contents.innerHTML;
        }
      }

      const doc = new DOMParser().parseFromString(combinedHtml, 'text/html');
      const urlCache = b.archive?.urlCache ?? {};

      // Resolve images
      doc.querySelectorAll('img').forEach(img => {
        const src = img.getAttribute('src');
        if (src) {
          const resolved = b.path?.resolve?.(src);
          if (resolved && urlCache[resolved]) img.setAttribute('src', urlCache[resolved]);
        }
      });
      doc.querySelectorAll('image').forEach(img => {
        const src = img.getAttribute('xlink:href') || img.getAttribute('href');
        if (src) {
          const resolved = b.path?.resolve?.(src);
          if (resolved && urlCache[resolved]) img.setAttribute('xlink:href', urlCache[resolved]);
        }
      });

      // Handle ruby
      doc.querySelectorAll('ruby').forEach(ruby => {
        const parts: string[] = [];
        ruby.childNodes.forEach(node => {
          if (node.nodeType === Node.TEXT_NODE) parts.push(node.textContent || '');
          else if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as Element;
            if (el.tagName === 'RT' || el.tagName === 'RTC') {
              const rt = el.textContent || '';
              if (rt) parts.push(`(${rt})`);
            } else parts.push(el.textContent || '');
          }
        });
        const span = doc.createElement('span');
        span.textContent = parts.join('');
        ruby.replaceWith(span);
      });

      // Page progression direction
      const pkg = b.package?.metadata?.['page-progression-direction'];
      setPageProgressionDir(pkg === 'rtl' ? 'rtl' : 'ltr');

      const fixedHtml = doc.body.innerHTML;
      const md = await htmlToMarkdown(fixedHtml);

      // Store spine links for interception
      const spineHrefs = new Set(
        (spine.items as any[]).map((s: any) => s.href.split('#')[0]),
      );
      setChapterLinks(spineHrefs);

      // Chapter nav — use TOC-based navigation (not raw spine index)
      const tocIdx = flatToc.findIndex(t => t.href === href || t.href.split('#')[0] === cleanHref);
      setPrevHref(tocIdx > 0 ? flatToc[tocIdx - 1]!.href : null);
      setNextHref(tocIdx < flatToc.length - 1 ? flatToc[tocIdx + 1]!.href : null);
      setCoverTapped(true);

      // Save position
      const tocItem = flatToc.find(t => t.href === href);
      await updateEpubMeta({ lastChapterHref: href, lastChapterTitle: tocItem?.label || null });

      return md;
    } catch (err) {
      console.error('Error loading chapter:', err);
      setError('Failed to load chapter');
      return '';
    } finally {
      setLoading(false);
    }
  }, [flatToc]);

  /** Next chapter. */
  const nextChapter = useCallback(async () => {
    if (!nextHref) return;
    await loadChapter(nextHref);
  }, [nextHref, loadChapter]);

  /** Previous chapter. */
  const prevChapter = useCallback(async () => {
    if (!prevHref) return;
    await loadChapter(prevHref);
  }, [prevHref, loadChapter]);

  /** Close book. */
  const close = useCallback(async () => {
    bookRef.current = null;
    setBook(null);
    setToc([]);
    setFlatToc([]);
    setCoverUrl(null);
    setCoverTapped(false);
    setChapterHref(null);
    setChapterTitle(null);
    setPrevHref(null);
    setNextHref(null);
    setFileName(null);
    setChapterLinks(new Set());
    setError(null);
    await deleteEpub();
  }, []);

  /** Restore from IndexedDB. Returns the chapter markdown text and anchor. */
  const restoreFromStorage = useCallback(async (): Promise<{
    markdown: string;
    anchor: string | null;
  } | null> => {
    try {
      const stored = await loadEpub();
      if (stored?.data && stored.meta.fileName) {
        setFileName(stored.meta.fileName);
        const result = await loadFile(stored.data, stored.meta.fileName);
        if (result && stored.meta.lastChapterHref) {
          await new Promise(resolve => setTimeout(resolve, 100));
          const md = await loadChapter(stored.meta.lastChapterHref);
          return { markdown: md, anchor: stored.meta.lastAnchor ?? null };
        }
        return result ? { markdown: '', anchor: stored.meta.lastAnchor ?? null } : null;
      }
    } catch { /* ignore */ }
    return null;
  }, [loadFile, loadChapter]);

  /** Save anchor. */
  const saveAnchor = useCallback(async (anchor: string) => {
    await updateEpubMeta({ lastAnchor: anchor });
  }, []);

  // Save chapter title when it changes
  useEffect(() => {
    if (chapterHref && chapterTitle) {
      updateEpubMeta({ lastChapterHref: chapterHref, lastChapterTitle: chapterTitle });
    }
  }, [chapterHref, chapterTitle]);

  return {
    book,
    toc,
    flatToc,
    coverUrl,
    coverTapped,
    chapterHref,
    chapterTitle,
    prevHref,
    nextHref,
    fileName,
    loading,
    error,
    chapterLinks,
    pageProgressionDir,
    loadFile,
    loadChapter,
    nextChapter,
    prevChapter,
    close,
    restoreFromStorage,
    saveAnchor,
  };
}
