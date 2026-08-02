/**
 * Hook for managing EPUB books: load, parse, chapter navigation,
 * image resolution, ruby text, internal links, and IndexedDB persistence.
 *
 * Unlike the original single-book implementation, every book the user opens
 * gets its own stored handle (keyed by file content hash), and the hook
 * tracks per-book reading progress (character counts) so the bookshelf can
 * show how much of each book has been read and resume at the saved position.
 */

import { useState, useCallback, useRef } from 'react';
import {
  saveEpub,
  loadEpub,
  updateEpubMeta,
  deleteEpub,
  listEpubs,
  sha256Hex,
  type EpubSummary,
} from '@/lib/epub-store';
import type { TocItem } from '@/components/reader/epub-upload';
import { logerr } from '@/lib/logger';

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

/** Collapse all whitespace runs to single spaces — the basis for char counting
 * and anchor matching (markdown-rendered text normalizes whitespace too). */
function normalizeText(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Convert a cover URL into a stable data URL before persisting it.
 * epubjs's coverUrl() returns a blob: URL (URL.createObjectURL), which is
 * invalidated on page refresh — storing it would leave broken covers on the
 * bookshelf after reload.
 */
async function toStableCoverUrl(url: string | null): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith('data:')) return url;
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** Flatten nested TOC. */
function flatten(items: TocItem[]): TocItem[] {
  const result: TocItem[] = [];
  for (const item of items) {
    result.push({ href: item.href, label: item.label });
    if (item.subitems?.length) result.push(...flatten(item.subitems));
  }
  return result;
}

/** Sum of the plain-text character counts of all chapters before `tocIdx`. */
function prefixSum(counts: Record<string, number>, toc: TocItem[], tocIdx: number): number {
  let sum = 0;
  for (let i = 0; i < tocIdx; i++) sum += counts[toc[i]!.href] ?? 0;
  return sum;
}

/**
 * Plain-text character count per TOC chapter, computed by loading the same
 * spine ranges that loadChapter uses. Expensive on large books, so it runs
 * once in the background and the result is cached in IndexedDB.
 */
async function computeChapterCharCounts(b: any, toc: TocItem[]): Promise<Record<string, number>> {
  const spine = await b.loaded.spine;
  const tocHrefs = toc.map(t => t.href.split('#')[0]);
  const counts: Record<string, number> = {};
  for (const item of toc) {
    const cleanHref = item.href.split('#')[0];
    const startIdx = (spine.items as any[]).findIndex((s: any) => s.href === cleanHref);
    if (startIdx === -1) continue;
    let endIdx = (spine.items as any[]).findIndex(
      (s: any, i: number) => i > startIdx && tocHrefs.includes(s.href),
    );
    if (endIdx === -1) endIdx = (spine.items as any[]).length;

    let text = '';
    for (let i = startIdx; i < endIdx; i++) {
      const spineItem = (spine.items as any[])[i]!;
      const item = spine.get(spineItem.href);
      if (item) {
        const contents = await item.load(b.load.bind(b));
        text += contents.body?.textContent ?? '';
      }
    }
    counts[item.href] = normalizeText(text).length;
  }
  return counts;
}

export interface LoadFileResult {
  /** Stable id for the stored book handle. */
  id: string;
  flatToc: TocItem[];
  firstChapterHref: string | null;
  /** True if this file already had a stored handle (progress preserved). */
  existing: boolean;
  lastChapterHref: string | null;
  lastAnchor: string | null;
  lastAnchorOffset: number;
}

/** Internal result of parsing + storing a book, before reader state is touched. */
interface ParseStoreResult {
  b: any;
  id: string;
  navToc: TocItem[];
  flat: TocItem[];
  cover: string | null;
  firstHref: string | null;
  existing: boolean;
  lastChapterHref: string | null;
  lastAnchor: string | null;
  lastAnchorOffset: number;
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
  /** Bookshelf entries (metadata only), sorted by last read. */
  books: EpubSummary[];
  /** Id of the currently open book, or null when showing the bookshelf. */
  openBookId: string | null;
  /** Reload the bookshelf list from IndexedDB. */
  refreshBooks: () => Promise<EpubSummary[]>;
  /** Open a stored book and resume at its saved chapter/page. */
  openBook: (id: string) => Promise<{ markdown: string; anchor: string | null } | null>;
  /** Remove a stored book from the bookshelf (deletes its handle). */
  removeBook: (id: string) => Promise<void>;
  /** Add a file to the bookshelf without opening it. */
  addBook: (data: ArrayBuffer, fileName: string) => Promise<{ id: string } | null>;
  /** Load a file from an ArrayBuffer into the reader (opens the book). */
  loadFile: (data: ArrayBuffer, fileName: string) => Promise<LoadFileResult | null>;
  /** Load a chapter by href. Returns the markdown text plus an anchor text
   *  snippet to seek to (from the href's fragment, or the restore position). */
  loadChapter: (
    href: string,
    opts?: { anchorOffset?: number; anchor?: string | null },
  ) => Promise<{ markdown: string; anchor: string | null }>;
  /** Go to the next chapter. */
  nextChapter: () => Promise<void>;
  /** Go to the previous chapter. */
  prevChapter: () => Promise<void>;
  /** Close the book and return to the bookshelf (the handle is kept). */
  close: () => Promise<void>;
  /** Clear the current error message (e.g. after showing an import dialog). */
  clearError: () => void;
  /** Update the last anchor (reading position) in IndexedDB. */
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
  const [books, setBooks] = useState<EpubSummary[]>([]);
  const [openBookId, setOpenBookId] = useState<string | null>(null);

  const bookRef = useRef<any>(null);
  const currentBookIdRef = useRef<string | null>(null);
  const flatTocRef = useRef<TocItem[]>([]);
  const chapterHrefRef = useRef<string | null>(null);
  const charCountsRef = useRef<Record<string, number>>({});
  const chapterPlainTextRef = useRef<string | null>(null);

  /** Reload the bookshelf list from IndexedDB. */
  const refreshBooks = useCallback(async (): Promise<EpubSummary[]> => {
    const list = await listEpubs();
    setBooks(list);
    return list;
  }, []);

  /** Compute and persist per-chapter char counts once a book is opened. */
  const computeAndPersistCounts = useCallback(async (b: any, id: string, toc: TocItem[]) => {
    try {
      const counts = await computeChapterCharCounts(b, toc);
      const totalChars = Object.values(counts).reduce((a, c) => a + c, 0);
      charCountsRef.current = counts;
      const stored = await loadEpub(id);
      const meta = stored?.meta;
      if (meta) {
        const tocIdx = toc.findIndex(
          t => t.href === meta.lastChapterHref || t.href.split('#')[0] === meta.lastChapterHref?.split('#')[0],
        );
        const readChars = tocIdx >= 0
          ? prefixSum(counts, toc, tocIdx) + (meta.lastAnchorOffset ?? 0)
          : meta.readChars ?? 0;
        await updateEpubMeta(id, { chapterCharCounts: counts, totalChars, readChars });
      }
      await refreshBooks();
    } catch (err) {
      logerr('Error computing EPUB character counts:', err);
    }
  }, [refreshBooks]);

  /**
   * Parse an EPUB and persist its per-book handle (id, cover, progress, last
   * read). Does not touch reader state — shared by loadFile (open) and addBook
   * (add to shelf only).
   */
  const parseAndStore = useCallback(async (data: ArrayBuffer, fName: string): Promise<ParseStoreResult | null> => {
    let id: string;
    try {
      id = await sha256Hex(data);
    } catch {
      id = `fn-${fName}-${data.byteLength}`;
    }
    const existing = await loadEpub(id);

    const ePubModule = await import('epubjs');
    const ePub = ePubModule.default;
    const b = ePub(data);
    setError(null);

    try {
      const navigation = await b.loaded.navigation;
      const navToc = navigation.toc as TocItem[];
      const flat = flatten(navToc);
      const cover = await toStableCoverUrl(await b.coverUrl());

      await saveEpub(id, data, {
        id,
        fileName: fName,
        coverUrl: cover,
        lastReadAt: Date.now(),
      });

      // Character counts are computed once per book and cached.
      if (existing?.meta.chapterCharCounts && Object.keys(existing.meta.chapterCharCounts).length > 0) {
        charCountsRef.current = existing.meta.chapterCharCounts;
      } else {
        charCountsRef.current = {};
        void computeAndPersistCounts(b, id, flat);
      }

      const firstHref = flat.length > 0 ? flat[0]!.href : null;
      if (firstHref) await b.ready;
      return {
        b,
        id,
        navToc,
        flat,
        cover: cover ?? null,
        firstHref,
        existing: !!existing,
        lastChapterHref: existing?.meta.lastChapterHref ?? null,
        lastAnchor: existing?.meta.lastAnchor ?? null,
        lastAnchorOffset: existing?.meta.lastAnchorOffset ?? 0,
      };
    } catch (err) {
      logerr('Error loading EPUB:', err);
      setError('msg.epub_parse_error');
    }
    return null;
  }, [computeAndPersistCounts]);

  /** Load a file into the reader. Returns the book id and first chapter for chaining. */
  const loadFile = useCallback(async (data: ArrayBuffer, fName: string): Promise<LoadFileResult | null> => {
    const result = await parseAndStore(data, fName);
    if (!result) return null;
    const { b, id, navToc, flat, cover, firstHref, existing, lastChapterHref, lastAnchor, lastAnchorOffset } = result;
    bookRef.current = b;
    currentBookIdRef.current = id;
    setBook(b);
    setOpenBookId(id);
    setFileName(fName);
    setCoverTapped(false);
    setCoverUrl(cover);
    if (!cover) setCoverTapped(true);
    setToc(navToc);
    setFlatToc(flat);
    flatTocRef.current = flat;
    return {
      id,
      flatToc: flat,
      firstChapterHref: firstHref,
      existing,
      lastChapterHref,
      lastAnchor,
      lastAnchorOffset,
    };
  }, [parseAndStore]);

  /** Add a file to the bookshelf without opening it. */
  const addBook = useCallback(async (data: ArrayBuffer, fName: string): Promise<{ id: string } | null> => {
    const result = await parseAndStore(data, fName);
    if (!result) return null;
    await refreshBooks();
    return { id: result.id };
  }, [parseAndStore, refreshBooks]);

  /** Load a chapter by href from the TOC. Concatenates all spine items belonging to this chapter. */
  const loadChapter = useCallback(async (
    href: string,
    opts?: { anchorOffset?: number; anchor?: string | null },
  ): Promise<{ markdown: string; anchor: string | null }> => {
    const b = bookRef.current;
    if (!b) return { markdown: '', anchor: null };
    setLoading(true);
    setChapterHref(href);
    chapterHrefRef.current = href;
    setError(null);

    try {
      const spine = await b.loaded.spine;
      const cleanHref = href.split('#')[0];

      // Find which spine items belong to this TOC chapter.
      const tocHrefs = flatTocRef.current.map(t => t.href.split('#')[0]);
      const startIdx = (spine.items as any[]).findIndex((s: any) => s.href === cleanHref);
      let endIdx = (spine.items as any[]).findIndex(
        (s: any, i: number) => i > startIdx && tocHrefs.includes(s.href),
      );
      if (endIdx === -1) endIdx = (spine.items as any[]).length;

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

      // Handle ruby — remove furigana, keep only the base text
      doc.querySelectorAll('ruby').forEach(ruby => {
        const textParts: string[] = [];
        ruby.childNodes.forEach(node => {
          if (node.nodeType === Node.TEXT_NODE) {
            textParts.push(node.textContent || '');
          } else if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as Element;
            // Skip RT (ruby text) and RTC elements, keep only base (RB) or other content
            if (el.tagName !== 'RT' && el.tagName !== 'RTC') {
              textParts.push(el.textContent || '');
            }
          }
        });
        const span = doc.createElement('span');
        span.textContent = textParts.join('');
        ruby.replaceWith(span);
      });

      // Page progression direction
      const pkg = b.package?.metadata?.['page-progression-direction'];
      setPageProgressionDir(pkg === 'rtl' ? 'rtl' : 'ltr');

      const fixedHtml = doc.body.innerHTML;
      const md = await htmlToMarkdown(fixedHtml);

      // Normalized plain text — used to map anchors to character offsets.
      chapterPlainTextRef.current = normalizeText(doc.body.textContent ?? '');

      // Anchor text for in-book link navigation: resolve the href's fragment
      // to the targeted element's text, which ReaderPanel can seek to.
      let seekAnchor: string | null = opts?.anchor ?? null;
      const fragment = href.split('#')[1];
      if (!seekAnchor && fragment) {
        const el = doc.getElementById(fragment);
        if (el) {
          const anchorText = normalizeText(el.textContent ?? '');
          if (anchorText) seekAnchor = anchorText.slice(0, 40);
        }
      }

      // Store spine links for interception
      const spineHrefs = new Set(
        (spine.items as any[]).map((s: any) => s.href.split('#')[0]),
      );
      setChapterLinks(spineHrefs);

      // Chapter nav — use TOC-based navigation (not raw spine index)
      const tocIdx = flatTocRef.current.findIndex(
        t => t.href === href || t.href.split('#')[0] === cleanHref,
      );
      setPrevHref(tocIdx > 0 ? flatTocRef.current[tocIdx - 1]!.href : null);
      setNextHref(tocIdx < flatTocRef.current.length - 1 ? flatTocRef.current[tocIdx + 1]!.href : null);
      setCoverTapped(true);

      // Save position + reading progress
      const id = currentBookIdRef.current;
      const offset = opts?.anchorOffset ?? 0;
      const readChars = tocIdx >= 0
        ? prefixSum(charCountsRef.current, flatTocRef.current, tocIdx) + offset
        : 0;
      const tocItem = flatTocRef.current.find(t => t.href === href);
      if (id) {
        await updateEpubMeta(id, {
          lastChapterHref: href,
          lastChapterTitle: tocItem?.label ?? null,
          lastAnchor: opts?.anchor ?? null,
          lastAnchorOffset: offset,
          readChars,
          lastReadAt: Date.now(),
        });
      }

      return { markdown: md, anchor: seekAnchor };
    } catch (err) {
      logerr('Error loading chapter:', err);
      setError('msg.epub_chapter_error');
      return { markdown: '', anchor: null };
    } finally {
      setLoading(false);
    }
  }, []);

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

  /** Open a stored book at its saved chapter/page. */
  const openBook = useCallback(async (id: string): Promise<{ markdown: string; anchor: string | null } | null> => {
    const stored = await loadEpub(id);
    if (!stored) return null;
    const result = await loadFile(stored.data, stored.meta.fileName);
    if (!result) return null;
    const target = stored.meta.lastChapterHref ?? result.firstChapterHref;
    if (!target) return { markdown: '', anchor: null };
    const { markdown, anchor } = await loadChapter(target, {
      anchorOffset: stored.meta.lastAnchorOffset ?? 0,
      anchor: stored.meta.lastAnchor ?? null,
    });
    return { markdown, anchor };
  }, [loadFile, loadChapter]);

  /** Close book and return to the bookshelf. The stored handle is kept. */
  const close = useCallback(async () => {
    bookRef.current = null;
    currentBookIdRef.current = null;
    chapterPlainTextRef.current = null;
    chapterHrefRef.current = null;
    charCountsRef.current = {};
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
    setOpenBookId(null);
    await refreshBooks();
  }, [refreshBooks]);

  /** Clear the current error message. */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  /** Remove a stored book from the bookshelf. */
  const removeBook = useCallback(async (id: string) => {
    await deleteEpub(id);
    if (currentBookIdRef.current === id) currentBookIdRef.current = null;
    await refreshBooks();
  }, [refreshBooks]);

  /** Save anchor (reading position within the current chapter). */
  const saveAnchor = useCallback(async (anchor: string) => {
    const id = currentBookIdRef.current;
    if (!id) return;
    const plain = chapterPlainTextRef.current;
    const idx = plain ? plain.indexOf(anchor) : -1;
    if (idx < 0) {
      // Anchor not found in the chapter text — just refresh the last-read time.
      await updateEpubMeta(id, { lastReadAt: Date.now() });
      return;
    }
    const tocIdx = flatTocRef.current.findIndex(
      t => t.href === chapterHrefRef.current || t.href.split('#')[0] === chapterHrefRef.current?.split('#')[0],
    );
    const readChars = tocIdx >= 0
      ? prefixSum(charCountsRef.current, flatTocRef.current, tocIdx) + idx
      : 0;
    await updateEpubMeta(id, {
      lastAnchor: anchor,
      lastAnchorOffset: idx,
      readChars,
      lastReadAt: Date.now(),
    });
  }, []);

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
    books,
    openBookId,
    refreshBooks,
    openBook,
    addBook,
    removeBook,
    loadFile,
    loadChapter,
    nextChapter,
    prevChapter,
    close,
    clearError,
    saveAnchor,
  };
}
