/**
 * Hook for managing EPUB books with the whole-book model (SPEC-032):
 * spine flow + TOC bookmarks + BookLocation navigation + per-spine search.
 *
 * The chapter-at-a-time API (loadChapter / nextChapter / prevChapter) is
 * gone — everything (TOC jumps, internal links, search, restore) resolves to
 * a BookLocation { spineIndex, blockIndex, offset } via EpubBook.
 */

import { useState, useCallback, useRef } from 'react';
import { EpubBook, normalizeLanguageCode } from '@/lib/epub-book';
import type { BookLocation, TocMarker, TocNode } from '@/lib/epub-book-types';
import {
  saveEpub,
  loadEpub,
  updateEpubMeta,
  deleteEpub,
  saveBookIndex,
  loadBookIndex,
  deleteBookIndex,
  listEpubs,
  sha256Hex,
  type EpubSummary,
  type SpineIndexRecord,
} from '@/lib/epub-store';
import { epubLog, epubWarn, epubErr } from '@/lib/epub-log';

/** A single in-book search hit, located in the book flow. */
export interface EpubSearchResult {
  location: BookLocation;
  /** TOC label of the containing chapter (nearest preceding entry). */
  chapterLabel: string;
  /** Display snippet around the match (may be truncated with …). */
  snippet: string;
  /** Char offset of the match inside `snippet` (after any leading …). */
  snippetMatchStart: number;
  /** Length of the matched text inside `snippet`. */
  snippetMatchLen: number;
  /** Char range of the match inside the target block's text. */
  match: { start: number; end: number };
}

/** Highlight target: a char range inside a specific block. */
export interface EpubSearchMatch {
  spineIndex: number;
  blockIndex: number;
  start: number;
  end: number;
}

export interface UseEpubReturn {
  /** The whole-book model (epubjs-backed). */
  book: EpubBook | null;
  /** Nested TOC items (full hierarchy). */
  toc: TocNode[];
  /** Resolved TOC markers (skips entries that don't resolve). */
  markers: TocMarker[] | null;
  /** Cover image data URL. */
  coverUrl: string | null;
  /** Whether the cover has been tapped. */
  coverTapped: boolean;
  /** File name of the loaded EPUB. */
  fileName: string | null;
  /** Loading state. */
  loading: boolean;
  /** Error message key. */
  error: string | null;
  /** Page progression direction. */
  pageProgressionDir: 'ltr' | 'rtl';
  /** Bookshelf entries (metadata only), sorted by last read. */
  books: EpubSummary[];
  /** Id of the currently open book, or null when showing the bookshelf. */
  openBookId: string | null;
  /** Reload the bookshelf list from IndexedDB. */
  refreshBooks: () => Promise<EpubSummary[]>;
  /** Open a stored book; returns the location to resume at (or null). */
  openBook: (id: string, opts?: { skipCover?: boolean }) => Promise<BookLocation | null>;
  /** Search the open book's whole text, returning located snippets. */
  searchBook: (query: string) => Promise<EpubSearchResult[]>;
  /** Add a file to the bookshelf without opening it. */
  addBook: (data: ArrayBuffer, fileName: string, importLanguage?: string | null) => Promise<{ id: string } | null>;
  /** Remove a stored book from the bookshelf (deletes its handle + index). */
  removeBook: (id: string) => Promise<void>;
  /** Close the book and return to the bookshelf (the handle is kept). */
  close: () => Promise<void>;
  /** Dismiss the cover and enter the reader at the current location. */
  dismissCover: () => void;
  /** Clear the current error message (e.g. after showing an import dialog). */
  clearError: () => void;
  /** Persist the current reading location + progress. */
  saveLocation: (location: BookLocation) => Promise<void>;
  /** Resolve an href (TOC/link) to a location. */
  resolveHref: (href: string, fromHref?: string) => Promise<BookLocation | null>;
}

/**
 * Build a display snippet around a match (truncated with … when needed).
 *
 * The match is placed near the START of the snippet (short lead-in, generous
 * tail) so it stays inside the results' two-line clamp — with CJK text the
 * sidebar fits only ~17 chars per line, so a 40-char lead-in pushed the
 * match past the clip.
 */
function buildSnippet(
  text: string,
  matchIdx: number,
  matchLen: number,
): { snippet: string; matchStart: number } {
  const start = Math.max(0, matchIdx - 12);
  const end = Math.min(text.length, matchIdx + matchLen + 64);
  let snippet = text.slice(start, end);
  let matchStart = matchIdx - start;
  if (start > 0) {
    snippet = `…${snippet}`;
    matchStart += 1;
  }
  if (end < text.length) snippet = `${snippet}…`;
  return { snippet, matchStart };
}

/** Find the block containing a char offset (starts are sorted ascending). */
function blockIndexForOffset(starts: number[], offset: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  let best = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (starts[mid]! <= offset) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

/** Total chars before a location, given per-spine index records. */
function charsBeforeLocation(
  records: SpineIndexRecord[],
  loc: BookLocation,
): number {
  let sum = 0;
  for (let i = 0; i < loc.spineIndex && i < records.length; i++) {
    sum += records[i]!.text.length;
  }
  const rec = records[loc.spineIndex];
  if (rec) {
    const start = rec.starts[loc.blockIndex];
    sum += (start ?? 0) + loc.offset;
  }
  return sum;
}

export function useEpub(): UseEpubReturn {
  const [book, setBook] = useState<EpubBook | null>(null);
  const [toc, setToc] = useState<TocNode[]>([]);
  const [markers, setMarkers] = useState<TocMarker[] | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [coverTapped, setCoverTapped] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pageProgressionDir, setPageProgressionDir] = useState<'ltr' | 'rtl'>('ltr');
  const [books, setBooks] = useState<EpubSummary[]>([]);
  const [openBookId, setOpenBookId] = useState<string | null>(null);

  const bookRef = useRef<EpubBook | null>(null);
  const currentBookIdRef = useRef<string | null>(null);
  const markersRef = useRef<TocMarker[] | null>(null);
  const indexRef = useRef<SpineIndexRecord[] | null>(null);
  const indexingRef = useRef<Map<string, Promise<void>>>(new Map());

  /** Reload the bookshelf list from IndexedDB. */
  const refreshBooks = useCallback(async (): Promise<EpubSummary[]> => {
    const list = await listEpubs();
    setBooks(list);
    return list;
  }, []);

  /** Build + persist the whole-book search index (chunked, deduped). */
  const computeAndPersistIndex = useCallback(async (b: EpubBook, id: string) => {
    const inFlight = indexingRef.current.get(id);
    if (inFlight) return inFlight;
    const run = (async () => {
      epubLog(`building search index for book ${id} (${b.spine.length} spines)…`);
      const records: SpineIndexRecord[] = [];
      let totalChars = 0;
      for (let i = 0; i < b.spine.length; i++) {
        const { text, starts } = await b.spineTextData(i);
        records.push({ spineIndex: i, text, starts });
        totalChars += text.length;
      }
      indexRef.current = records;
      await saveBookIndex(id, records);
      epubLog(`search index complete: ${records.length} spines, ${totalChars} chars`);
      const stored = await loadEpub(id);
      if (stored) {
        const meta = stored.meta;
        const readChars = meta.lastLocation
          ? charsBeforeLocation(records, meta.lastLocation)
          : meta.readChars ?? 0;
        await updateEpubMeta(id, { totalChars, readChars });
      }
      await refreshBooks();
    })();
    indexingRef.current.set(id, run);
    try {
      await run;
    } finally {
      indexingRef.current.delete(id);
    }
  }, [refreshBooks]);

  /** Load the cached index or build it (mutates indexRef). */
  const ensureIndex = useCallback(async (b: EpubBook, id: string) => {
    if (indexRef.current && indexRef.current.length > 0) return;
    const cached = await loadBookIndex(id);
    if (cached && cached.length > 0) {
      indexRef.current = cached;
      return;
    }
    await computeAndPersistIndex(b, id);
  }, [computeAndPersistIndex]);

  const setOpenBook = useCallback((b: EpubBook) => {
    bookRef.current = b;
    setBook(b);
    setToc(b.toc);
    setCoverUrl(b.coverUrl);
    setPageProgressionDir(b.pageProgressionDir);
    markersRef.current = null;
    setMarkers(null);
    indexRef.current = null;
    void b.tocMarkers().then(m => {
      markersRef.current = m;
      setMarkers(m);
    });
  }, []);

  /** Parse an EPUB and persist its per-book handle. */
  const parseAndStore = useCallback(async (
    data: ArrayBuffer,
    fName: string,
    importLanguage?: string | null,
  ): Promise<{ b: EpubBook; id: string; existing: boolean } | null> => {
    let id: string;
    try {
      id = await sha256Hex(data);
    } catch {
      id = `fn-${fName}-${data.byteLength}`;
    }
    setError(null);
    let b: EpubBook;
    try {
      b = await EpubBook.open(data);
    } catch (err) {
      epubErr('parse failed:', err);
      setError('msg.epub_parse_error');
      return null;
    }
    const existing = await loadEpub(id);
    await saveEpub(id, data, {
      id,
      fileName: fName,
      // Books are scoped to the L2 they were uploaded under — no OPF
      // language sniffing. Opening a stored book keeps its existing tag.
      language: importLanguage
        ? normalizeLanguageCode(importLanguage)
        : existing?.meta.language ?? null,
      coverUrl: b.coverUrl,
      lastReadAt: Date.now(),
    });
    // Warm the search index in the background unless a fresh one is cached.
    const cachedIndex = await loadBookIndex(id);
    if (!cachedIndex) void computeAndPersistIndex(b, id);
    return { b, id, existing: !!existing };
  }, [computeAndPersistIndex]);

  /** Open a stored book, resuming at its saved location (with migration). */
  const openBook = useCallback(async (
    id: string,
    opts?: { skipCover?: boolean },
  ): Promise<BookLocation | null> => {
    const stored = await loadEpub(id);
    if (!stored) return null;
    const parsed = await parseAndStore(stored.data, stored.meta.fileName);
    if (!parsed) return null;
    const { b } = parsed;
    currentBookIdRef.current = id;
    setOpenBookId(id);
    setOpenBook(b);
    setFileName(stored.meta.fileName);

    const meta = stored.meta;
    let start: BookLocation | null = null;
    if (meta.lastLocation && meta.lastLocation.spineIndex < b.spine.length) {
      start = meta.lastLocation;
    } else if (meta.lastChapterHref) {
      // Pre-v3 handle: migrate chapter href → location.
      start = await b.resolveHref(meta.lastChapterHref);
    }
    if (!start) start = { spineIndex: 0, blockIndex: 0, offset: 0 };
    epubLog(`openBook "${stored.meta.fileName}" → resume spine=${start.spineIndex} block=${start.blockIndex} offset=${start.offset}`);
    setCoverTapped(opts?.skipCover || !b.coverUrl);
    await updateEpubMeta(id, {
      lastLocation: start,
      locationFormatVersion: 1,
      lastChapterHref: null,
      lastAnchor: null,
      lastAnchorOffset: 0,
      lastReadAt: Date.now(),
    });
    return start;
  }, [parseAndStore, setOpenBook]);

  /** Add a file to the bookshelf without opening it. */
  const addBook = useCallback(async (
    data: ArrayBuffer,
    fName: string,
    importLanguage?: string | null,
  ): Promise<{ id: string } | null> => {
    const parsed = await parseAndStore(data, fName, importLanguage);
    if (!parsed) return null;
    await refreshBooks();
    return { id: parsed.id };
  }, [parseAndStore, refreshBooks]);

  /** Search the whole book; results navigate by location. */
  const searchBook = useCallback(async (query: string): Promise<EpubSearchResult[]> => {
    const b = bookRef.current;
    const id = currentBookIdRef.current;
    if (!b || !id) return [];
    const q = query.replace(/\s+/g, ' ').trim().toLowerCase();
    if (!q) return [];

    await ensureIndex(b, id);
    const records = indexRef.current ?? [];
    const markersList = await b.tocMarkers();

    const MAX_RESULTS = 30;
    const results: EpubSearchResult[] = [];
    for (let i = 0; i < records.length && results.length < MAX_RESULTS; i++) {
      const rec = records[i]!;
      if (!rec.text) continue;
      const lower = rec.text.toLowerCase();
      let from = 0;
      while (results.length < MAX_RESULTS) {
        const idx = lower.indexOf(q, from);
        if (idx === -1) break;
        const blockIndex = blockIndexForOffset(rec.starts, idx);
        const blockStart = rec.starts[blockIndex] ?? 0;
        const location: BookLocation = {
          spineIndex: rec.spineIndex,
          blockIndex,
          offset: idx - blockStart,
        };
        const label = markerForLocation(markersList, location)?.node.label ?? '';
        const { snippet, matchStart } = buildSnippet(rec.text, idx, q.length);
        results.push({
          location,
          chapterLabel: label,
          snippet,
          snippetMatchStart: matchStart,
          snippetMatchLen: q.length,
          match: { start: idx - blockStart, end: idx - blockStart + q.length },
        });
        from = idx + q.length;
      }
    }
    return results;
  }, [ensureIndex]);

  /** Resolve an href (TOC entry or in-content link) to a location. */
  const resolveHref = useCallback(async (href: string, fromHref?: string) => {
    const b = bookRef.current;
    if (!b) {
      epubWarn(`resolveHref "${href}": no open book — returning null`);
      return null;
    }
    const loc = await b.resolveHref(href, fromHref);
    if (loc) {
      epubLog(`resolveHref "${href}" → spine=${loc.spineIndex} block=${loc.blockIndex} offset=${loc.offset}`);
    } else {
      epubWarn(`resolveHref "${href}" → null (unresolved)`);
    }
    return loc;
  }, []);

  /** Persist the current reading location + progress. */
  const saveLocation = useCallback(async (location: BookLocation) => {
    const id = currentBookIdRef.current;
    if (!id) return;
    const records = indexRef.current ?? [];
    const readChars = records.length ? charsBeforeLocation(records, location) : undefined;
    await updateEpubMeta(id, {
      lastLocation: location,
      lastReadAt: Date.now(),
      ...(readChars !== undefined ? { readChars } : {}),
    });
  }, []);

  /** Close book and return to the bookshelf (the handle is kept). */
  const close = useCallback(async () => {
    bookRef.current = null;
    currentBookIdRef.current = null;
    markersRef.current = null;
    indexRef.current = null;
    setBook(null);
    setToc([]);
    setMarkers(null);
    setCoverUrl(null);
    setCoverTapped(false);
    setFileName(null);
    setError(null);
    setOpenBookId(null);
    await refreshBooks();
  }, [refreshBooks]);

  /** Clear the current error message. */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  /** Dismiss the cover and enter the reader. */
  const dismissCover = useCallback(() => {
    setCoverTapped(true);
  }, []);

  /** Remove a stored book from the bookshelf. */
  const removeBook = useCallback(async (id: string) => {
    await deleteEpub(id);
    await deleteBookIndex(id).catch(() => {});
    if (currentBookIdRef.current === id) currentBookIdRef.current = null;
    await refreshBooks();
  }, [refreshBooks]);

  return {
    book,
    toc,
    markers,
    coverUrl,
    coverTapped,
    fileName,
    loading,
    error,
    pageProgressionDir,
    books,
    openBookId,
    refreshBooks,
    openBook,
    searchBook,
    addBook,
    removeBook,
    close,
    clearError,
    dismissCover,
    saveLocation,
    resolveHref,
  };
}

/** Find the marker (TOC entry) that locates a position in the book flow. */
export function markerForLocation(
  markers: TocMarker[],
  location: BookLocation,
): TocMarker | null {
  let best: TocMarker | null = null;
  for (const m of markers) {
    if (locLte(m.location, location)) best = m;
  }
  return best;
}

function locLte(a: BookLocation, b: BookLocation): boolean {
  return a.spineIndex < b.spineIndex ||
    (a.spineIndex === b.spineIndex && a.blockIndex < b.blockIndex) ||
    (a.spineIndex === b.spineIndex && a.blockIndex === b.blockIndex && a.offset <= b.offset);
}
