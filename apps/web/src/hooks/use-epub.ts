/**
 * Hook for managing EPUB books with the whole-book model (SPEC-032):
 * spine flow + TOC bookmarks + BookLocation navigation + per-spine search.
 *
 * The chapter-at-a-time API (loadChapter / nextChapter / prevChapter) is
 * gone — everything (TOC jumps, internal links, search, restore) resolves to
 * a BookLocation { spineIndex, blockIndex, offset } via EpubBook.
 */

import { useState, useCallback, useRef } from 'react';
import { findTextMatches } from '@langplayer/utils';
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
  isUnreadableRecordError,
  type EpubSummary,
  type SpineIndexRecord,
  type StoredEpub,
} from '@/lib/epub-store';
import { pdfInfo, renderPdfPage, type PdfOutlineItem } from '@/lib/pdf-book';
import { convertAltBookFormat, buildMinimalEpub } from '@langplayer/utils';
import { epubLog, epubWarn, epubErr, epubStorageErr } from '@/lib/epub-log';

/** How a stored book failed to read: irrecoverable (`unreadable`) or a read
 *  error that may succeed again later (`error`). */
export type EpubUnavailableKind = 'unreadable' | 'error';

/** `Name: message` for a caught error, for the storage error log. */
function errMessage(err: unknown): string {
  if (!err || typeof err !== 'object') return String(err);
  const e = err as { name?: unknown; message?: unknown };
  return `${String(e.name ?? 'Error')}: ${String(e.message ?? '')}`;
}

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
  /** Books whose stored record failed to read, keyed by id — drives the shelf's
   *  "no longer readable" badge. Survives a shelf refresh (the refresh itself
   *  cannot re-detect the failure, because it does not read the blob). */
  unreadable: Record<string, EpubUnavailableKind>;
  /** Id of the book whose most recent open attempt failed, or null. Distinguishes
   *  a failed open from a PDF open (which also resolves to a null location). */
  openFailureId: string | null;
  /** Clear a book's unavailable mark (used by the recovery Remove action). */
  clearUnreadable: (id: string) => void;
  /** Dismiss the open-failure notice (keeps the book on the shelf). */
  clearOpenFailure: () => void;
  /** Id of the currently open book, or null when showing the bookshelf. */
  openBookId: string | null;
  /** PDF reading session (format: 'pdf' entries): the binary + page/outline
   *  info, so the reader can render thumbnails and convert pages. */
  pdfDoc: { id: string; data: ArrayBuffer; pageCount: number; outline: PdfOutlineItem[] } | null;
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
  const [unreadable, setUnreadable] = useState<Record<string, EpubUnavailableKind>>({});
  const [openFailureId, setOpenFailureId] = useState<string | null>(null);
  const [openBookId, setOpenBookId] = useState<string | null>(null);
  const [pdfDoc, setPdfDoc] = useState<{
    id: string;
    data: ArrayBuffer;
    pageCount: number;
    outline: PdfOutlineItem[];
  } | null>(null);

  const bookRef = useRef<EpubBook | null>(null);
  const currentBookIdRef = useRef<string | null>(null);
  const markersRef = useRef<TocMarker[] | null>(null);
  const indexRef = useRef<SpineIndexRecord[] | null>(null);
  const indexingRef = useRef<Map<string, Promise<void>>>(new Map());

  /** Mark a book whose stored record could not be read. */
  const markUnreadable = useCallback((id: string, kind: EpubUnavailableKind) => {
    setUnreadable((prev) => (prev[id] === kind ? prev : { ...prev, [id]: kind }));
  }, []);

  /** Clear a book's unavailable mark (successful open/re-import, or removal). */
  const clearUnreadable = useCallback((id: string) => {
    setUnreadable((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  /**
   * Reload the bookshelf list from IndexedDB.
   *
   * `listEpubs` never fails because one record is unreadable — it reports those
   * as `unavailable` summaries. Marks are merged into the shelf's state (and
   * kept for books still listed), so a book that failed to open keeps its badge
   * across a refresh even though the refresh does not read the blob.
   */
  const refreshBooks = useCallback(async (): Promise<EpubSummary[]> => {
    const list = await listEpubs();
    setBooks(list);
    setUnreadable((prev) => {
      const next: Record<string, EpubUnavailableKind> = {};
      for (const book of list) {
        const kind = book.unavailable ?? prev[book.id];
        if (kind) next[book.id] = kind;
      }
      return next;
    });
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
      // The record may itself be unreadable (its blob file is gone): the index
      // is still persisted, only the progress recomputation is skipped.
      try {
        const stored = await loadEpub(id);
        if (stored) {
          const meta = stored.meta;
          const readChars = meta.lastLocation
            ? charsBeforeLocation(records, meta.lastLocation)
            : meta.readChars ?? 0;
          await updateEpubMeta(id, { totalChars, readChars });
        }
      } catch (err) {
        epubStorageErr(`could not update progress for ${id} after indexing: ${errMessage(err)}`);
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
    }).catch((err) => {
      epubWarn(`toc markers failed: ${errMessage(err)}`);
    });
  }, []);

  /** Parse an EPUB and persist its per-book handle. */
  const parseAndStore = useCallback(async (
    data: ArrayBuffer,
    fName: string,
    importLanguage?: string | null,
    opts?: { skipExisting?: boolean },
  ): Promise<{ b: EpubBook | null; id: string; existing: boolean } | null> => {
    let id: string;
    try {
      id = await sha256Hex(data);
    } catch {
      id = `fn-${fName}-${data.byteLength}`;
    }
    setError(null);
    // Content-hash dedupe (import path only): if the book is already in the
    // library, skip re-parsing/re-saving. openBook does NOT pass skipExisting,
    // because opening a stored book must re-parse the model to resume.
    // A record that cannot be read is treated as absent: the import then
    // overwrites it with fresh, readable bytes (the recovery path).
    let existing: StoredEpub | null = null;
    try {
      existing = await loadEpub(id);
    } catch (err) {
      epubWarn(`import "${fName}": existing record ${id} is unreadable (${errMessage(err)}) — replacing it`);
    }
    if (existing && opts?.skipExisting) {
      epubLog(`import "${fName}" — already in library, skipped (${id})`);
      return { b: null, id, existing: true };
    }
    let b: EpubBook;
    try {
      b = await EpubBook.open(data);
    } catch (err) {
      epubErr('parse failed:', err);
      setError('msg.epub_parse_error');
      return null;
    }
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
    // Failure is non-fatal (the search rebuilds on demand), but it must not
    // become an unhandled rejection.
    const cachedIndex = await loadBookIndex(id);
    if (!cachedIndex) {
      void computeAndPersistIndex(b, id).catch((err) => {
        epubStorageErr(`search index build failed for ${id}: ${errMessage(err)}`);
      });
    }
    clearUnreadable(id); // a fresh, readable record replaces any bad one
    return { b, id, existing: !!existing };
  }, [computeAndPersistIndex, clearUnreadable]);

  /** Open a stored book, resuming at its saved location (with migration). */
  const openBook = useCallback(async (
    id: string,
    opts?: { skipCover?: boolean },
  ): Promise<BookLocation | null> => {
    let stored: StoredEpub | null;
    try {
      stored = await loadEpub(id);
    } catch (err) {
      // The record cannot be read: most often its binary file was deleted from
      // disk, which Chrome reports as an irrecoverable `NotReadableError`. The
      // metadata mirror still names it, so the card can offer the recovery
      // (Remove → import the file again) instead of failing silently.
      const kind: EpubUnavailableKind = isUnreadableRecordError(err) ? 'unreadable' : 'error';
      epubStorageErr(`openBook ${id} could not read the stored record (${kind}): ${errMessage(err)}`);
      markUnreadable(id, kind);
      setOpenFailureId(id);
      setError('msg.epub_file_unreadable');
      return null;
    }
    if (!stored) {
      // Metadata without a record (e.g. an interrupted delete): nothing to open.
      epubStorageErr(`openBook ${id}: no stored record — marking it unavailable`);
      markUnreadable(id, 'unreadable');
      setOpenFailureId(id);
      setError('msg.epub_file_unreadable');
      return null;
    }
    clearUnreadable(id);
    currentBookIdRef.current = id;
    setOpenBookId(id);
    setFileName(stored.meta.fileName);

    // PDF entries: no spine/block model — the reader shows the thumbnails
    // grid and converts tapped pages to markdown via the vision model.
    if (stored.meta.format === 'pdf') {
      setPdfDoc({
        id,
        data: stored.data,
        pageCount: 1,
        outline: [],
      });
      // Resolve the real page count + outline in the background (rendering
      // the first page for the reader's cover is already done at import).
      void pdfInfo(stored.data).then((info) => {
        setPdfDoc((prev) =>
          prev && prev.id === id
            ? { ...prev, pageCount: info.pageCount, outline: info.outline }
            : prev,
        );
      }).catch((err) => {
        // The stored PDF could not be parsed — same recovery as an unreadable
        // record (Remove from the shelf, then import the file again).
        epubStorageErr(`openBook ${id}: stored PDF could not be parsed: ${errMessage(err)}`);
        markUnreadable(id, 'unreadable');
        setPdfDoc(null);
        setOpenBookId(null);
        setOpenFailureId(id);
        setError('msg.epub_file_unreadable');
      });
      setBook(null);
      setToc([]);
      setMarkers(null);
      setCoverTapped(true);
      setOpenFailureId(null);
      await updateEpubMeta(id, { lastReadAt: Date.now() });
      return null;
    }

    const parsed = await parseAndStore(stored.data, stored.meta.fileName);
    if (!parsed?.b) {
      // `parseAndStore` already set the error ('msg.epub_parse_error').
      setOpenFailureId(id);
      return null;
    }
    const { b } = parsed;
    setPdfDoc(null);
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
    setOpenFailureId(null);
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
  }, [parseAndStore, setOpenBook, markUnreadable, clearUnreadable]);

  /** Add a file to the bookshelf without opening it. */
  const addBook = useCallback(async (
    data: ArrayBuffer,
    fName: string,
    importLanguage?: string | null,
  ): Promise<{ id: string } | null> => {
    if (/\.pdf$/i.test(fName)) {
      // PDF: first page rendered at import becomes the shelf cover; the
      // reader opens the thumbnails grid and converts pages on demand.
      let id: string;
      try {
        id = await sha256Hex(data);
      } catch {
        id = `fn-${fName}-${data.byteLength}`;
      }
      // An unreadable existing record is treated as absent — the save below
      // replaces it (same recovery as the EPUB import path).
      let existing: StoredEpub | null = null;
      try {
        existing = await loadEpub(id);
      } catch (err) {
        epubWarn(`import "${fName}": existing PDF ${id} is unreadable (${errMessage(err)}) — replacing it`);
      }
      // Content-hash dedupe: a PDF already in the library is skipped (no
      // duplicate handle, no re-cover render).
      if (existing) {
        epubLog(`import "${fName}" — PDF already in library, skipped (${id})`);
        await refreshBooks();
        return { id };
      }
      let coverUrl: string | null = null;
        try {
          coverUrl = await renderPdfPage(data, 1, 1.2);
        } catch (err) {
          epubWarn(`PDF cover render failed: ${(err as Error)?.message ?? err}`);
        }
      // Log the byte length right before the IndexedDB put. A detached
      // ArrayBuffer reports 0 here — if a PDF with content logs 0 bytes, the
      // cover render detached the buffer (see pdf-book.ts openDoc).
      epubLog(`saving PDF "${fName}" — ${data.byteLength} bytes, cover=${coverUrl ? 'yes' : 'no'}`);
      await saveEpub(id, data, {
        id,
        fileName: fName,
        format: 'pdf',
        language: importLanguage
          ? normalizeLanguageCode(importLanguage)
          : null,
        coverUrl,
        lastReadAt: Date.now(),
      });
      clearUnreadable(id);
      await refreshBooks();
      return { id };
    }
    // Epub-like formats (.fb2/.mobi/.azw3) → convert to a minimal EPUB and
    // store the result; the shelf keeps the original file name.
    const alt = convertAltBookFormat(data, fName);
    if (alt) {
      epubLog(`alt format "${fName}" → ${alt.toc.length} TOC entries, ${alt.xhtml.length} chars`);
      const epubData = await buildMinimalEpub(alt);
      const parsed = await parseAndStore(epubData, fName, importLanguage, { skipExisting: true });
      if (!parsed) return null;
      await refreshBooks();
      return { id: parsed.id };
    }
    const parsed = await parseAndStore(data, fName, importLanguage, { skipExisting: true });
    if (!parsed) return null;
    await refreshBooks();
    return { id: parsed.id };
  }, [parseAndStore, refreshBooks, clearUnreadable]);

  /** Search the whole book; results navigate by location. */
  const searchBook = useCallback(async (query: string): Promise<EpubSearchResult[]> => {
    const b = bookRef.current;
    const id = currentBookIdRef.current;
    if (!b || !id) return [];
    if (!query.trim()) return [];

    await ensureIndex(b, id);
    const records = indexRef.current ?? [];
    const markersList = await b.tocMarkers();

    const MAX_RESULTS = 30;
    const results: EpubSearchResult[] = [];
    for (let i = 0; i < records.length && results.length < MAX_RESULTS; i++) {
      const rec = records[i]!;
      if (!rec.text) continue;
      // Invisible-char- / whitespace-robust matching (U+200B between CJK
      // chars etc.). Matches come back in `rec.text` original coordinates.
      const matches = findTextMatches(rec.text, query, MAX_RESULTS - results.length);
      for (const m of matches) {
        const matchLen = m.end - m.start;
        const blockIndex = blockIndexForOffset(rec.starts, m.start);
        const blockStart = rec.starts[blockIndex] ?? 0;
        const location: BookLocation = {
          spineIndex: rec.spineIndex,
          blockIndex,
          offset: m.start - blockStart,
        };
        const label = markerForLocation(markersList, location)?.node.label ?? '';
        const { snippet, matchStart } = buildSnippet(rec.text, m.start, matchLen);
        results.push({
          location,
          chapterLabel: label,
          snippet,
          snippetMatchStart: matchStart,
          snippetMatchLen: matchLen,
          match: { start: m.start - blockStart, end: m.end - blockStart },
        });
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
    try {
      await updateEpubMeta(id, {
        lastLocation: location,
        lastReadAt: Date.now(),
        ...(readChars !== undefined ? { readChars } : {}),
      });
    } catch (err) {
      // Called fire-and-forget on every page turn: a failed progress save must
      // not become an unhandled rejection (the reader keeps working).
      epubStorageErr(`could not save the reading position for ${id}: ${errMessage(err)}`);
    }
  }, []);

  /** Close book and return to the bookshelf (the handle is kept). */
  const close = useCallback(async () => {
    bookRef.current = null;
    currentBookIdRef.current = null;
    markersRef.current = null;
    indexRef.current = null;
    setBook(null);
    setPdfDoc(null);
    setToc([]);
    setMarkers(null);
    setCoverUrl(null);
    setCoverTapped(false);
    setFileName(null);
    setError(null);
    setOpenBookId(null);
    setOpenFailureId(null);
    try {
      await refreshBooks();
    } catch (err) {
      epubStorageErr(`could not reload the bookshelf after closing the book: ${errMessage(err)}`);
    }
  }, [refreshBooks]);

  /** Clear the current error message. */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  /** Dismiss the open-failure notice (the book stays on the shelf, marked). */
  const clearOpenFailure = useCallback(() => {
    setOpenFailureId(null);
  }, []);

  /** Dismiss the cover and enter the reader. */
  const dismissCover = useCallback(() => {
    setCoverTapped(true);
  }, []);

  /** Remove a stored book from the bookshelf. */
  const removeBook = useCallback(async (id: string) => {
    try {
      await deleteEpub(id);
    } catch (err) {
      // Log, but still clear the local state: leaving a card the user asked to
      // remove is worse than a stale record that the next load prunes.
      epubStorageErr(`could not delete book ${id}: ${errMessage(err)}`);
    }
    await deleteBookIndex(id).catch(() => {});
    clearUnreadable(id);
    setOpenFailureId((current) => (current === id ? null : current));
    if (currentBookIdRef.current === id) currentBookIdRef.current = null;
    await refreshBooks();
  }, [refreshBooks, clearUnreadable]);

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
    unreadable,
    openFailureId,
    clearUnreadable,
    clearOpenFailure,
    openBookId,
    pdfDoc,
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
