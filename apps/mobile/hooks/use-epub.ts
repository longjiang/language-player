import { useState, useCallback, useRef, useEffect } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { md5 } from '@langplayer/utils';
import {
  openEpubBook,
  inspectEpubBook,
  sanitizeEpubId,
  unwrapEpubZipFile,
  type EpubBookModel,
  type BookLocation,
  type TocMarker,
} from '@/lib/epub-book';
import {
  saveEpub,
  listEpubs,
  updateEpubMeta,
  deleteEpub,
  readLegacyState,
  clearLegacyState,
  ensureLibraryDir,
  libraryFileUri,
  LIBRARY_DIR,
  setReaderClosed,
  clearReaderClosed,
  isReaderClosed,
  type EpubMeta,
  type EpubSummary,
} from '@/lib/epub-store';
import type { TocItem } from '@/lib/epub-parser';
import type { ContentBlock } from '@/lib/parse-markdown';
import { log } from '@/lib/logger';
import { useT } from '@/hooks/use-t';
import { localizedError } from '@/lib/errors';

/** Reuse the persisted cover only while its file still exists; otherwise
 *  return null so openEpubBook re-extracts the cover from the EPUB. */
async function coverUriIfExists(coverUri: string | null): Promise<string | null> {
  if (!coverUri?.startsWith('file://')) return coverUri;
  const info = await FileSystem.getInfoAsync(coverUri);
  return info.exists ? coverUri : null;
}

/**
 * Content digest of a stored book file (SPEC-065 "bookId"), used to dedupe
 * imports by content. Reads the file as base64 and hashes that string, so the
 * same bytes always produce the same digest regardless of file name. Returns
 * null if the file cannot be read (no dedupe for that import).
 */
async function hashBookContent(uri: string): Promise<string | null> {
  try {
    const b64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return `md5-${md5(b64)}`;
  } catch {
    return null;
  }
}

/** Recursively copy a directory (used for unzipped EPUB folder packages). */
async function copyDirectoryContents(srcDir: string, destDir: string): Promise<void> {
  const entries = await FileSystem.readDirectoryAsync(srcDir);
  for (const name of entries) {
    const src = `${srcDir}${name}`;
    const dst = `${destDir}${name}`;
    const info = await FileSystem.getInfoAsync(src);
    if (info.isDirectory) {
      await FileSystem.makeDirectoryAsync(dst, { intermediates: true });
      await copyDirectoryContents(`${src}/`, `${dst}/`);
    } else {
      await FileSystem.copyAsync({ from: src, to: dst });
    }
  }
}

export interface UseEpubReturn {
  /** Bookshelf entries (metadata only), sorted by last read. */
  books: EpubSummary[];
  /** Id of the currently open book, or null when showing the bookshelf. */
  openBookId: string | null;
  loading: boolean;
  /** Error message (already localized, or null). */
  error: string | null;
  /** True when the reader was explicitly closed for this L2 (persisted) —
   *  the bookshelf must NOT auto-open the last book until a book is opened
   *  again (user request: closed stays closed across nav + relaunch). */
  readerClosed: boolean;
  /** Nested TOC items of the open book. */
  toc: TocItem[];
  /** Flattened TOC entries resolved to whole-book locations. */
  markers: TocMarker[];
  /** Whole-book block stream (all linear spine items in order). */
  blocks: ContentBlock[] | null;
  chapterLabels: { blockIndex: number; label: string }[];
  totalChars: number;
  fileName: string | null;
  epubTitle: string;
  epubAuthor: string;
  coverUrl: string | null;
  /** Whether the reader has entered content (cover dismissed / skipped). */
  coverTapped: boolean;
  /** Location to resume at once the cover is dismissed. */
  initialLocation: BookLocation | null;
  /** Canonical zip paths of the spine items (for internal link resolution). */
  spineHrefs: string[];
  /** True once the bookshelf has been loaded (and legacy state migrated). */
  ready: boolean;
  /** Reload the bookshelf from storage (runs legacy migration once). */
  refreshBooks: () => Promise<void>;
  /** Import one EPUB from the document picker and open it at its cover. */
  pickFile: (importLanguage?: string) => Promise<void>;
  /** Open a stored book; returns the location to resume at. */
  openBook: (id: string, opts?: { skipCover?: boolean }) => Promise<BookLocation | null>;
  /** Close the book and return to the bookshelf (the handle is kept). */
  close: () => Promise<void>;
  /** Enter the reader after the cover has been tapped. */
  dismissCover: () => void;
  /** Persist the current reading location + progress. */
  saveLocation: (loc: BookLocation) => Promise<void>;
  /** Resolve a TOC/internal link href to a location in the open book. */
  resolveHref: (href: string, fromHref?: string) => Promise<BookLocation | null>;
  /** Remove a book from the shelf (deletes its stored handle + files). */
  removeBook: (id: string) => Promise<void>;
}

export function useEpub(l2Code?: string): UseEpubReturn {
  const t = useT();
  const [books, setBooks] = useState<EpubSummary[]>([]);
  const [openBookId, setOpenBookId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState<EpubBookModel | null>(null);
  const [coverTapped, setCoverTapped] = useState(false);
  const [initialLocation, setInitialLocation] = useState<BookLocation | null>(null);
  const [ready, setReady] = useState(false);
  /** Persisted "reader closed" latch for this L2 — true after an explicit
   *  close, blocks the mount-time auto-open until a book is opened again. */
  const [readerClosed, setReaderClosedState] = useState(false);
  /** Keep the latest L2 available to close()/openBook() without re-creating
   *  them (their identities must stay stable). */
  const l2Ref = useRef('');
  useEffect(() => {
    l2Ref.current = l2Code ?? '';
  }, [l2Code]);
  // Load the latch (and re-check when the L2 changes).
  useEffect(() => {
    let cancelled = false;
    if (!l2Code) { setReaderClosedState(false); return; }
    void isReaderClosed(l2Code).then((closed) => {
      if (!cancelled) setReaderClosedState(closed);
    });
    return () => { cancelled = true; };
  }, [l2Code]);

  const modelRef = useRef<EpubBookModel | null>(null);
  const openBookIdRef = useRef<string | null>(null);
  const openLoadingRef = useRef(false);
  const migratedRef = useRef(false);

  const setCurrentModel = useCallback((m: EpubBookModel, id: string, skipCover: boolean, resume: BookLocation | null) => {
    log('[epub] setCurrentModel', { id, skipCover, hadModel: Boolean(modelRef.current), prevId: openBookIdRef.current });
    modelRef.current?.close().catch(() => {});
    modelRef.current = m;
    openBookIdRef.current = id;
    setModel(m);
    setOpenBookId(id);
    setCoverTapped(skipCover);
    setInitialLocation(resume);
    setError(null);
  }, []);

  /** Reload the bookshelf list + migrate the pre-bookshelf single-book state. */
  const refreshBooks = useCallback(async () => {
    if (!migratedRef.current) {
      migratedRef.current = true;
      try {
        const legacy = await readLegacyState();
        if (legacy) {
          log(`[LP Mobile] 📖 migrating legacy EPUB state: ${legacy.fileName}`);
          await ensureLibraryDir();
          const id = sanitizeEpubId(legacy.fileName);
          const dest = libraryFileUri(id);
          const destInfo = await FileSystem.getInfoAsync(dest);
          if (!destInfo.exists) {
            await FileSystem.copyAsync({ from: legacy.fileUri, to: dest });
          }
          const sizeInfo = await FileSystem.getInfoAsync(dest);
          const m = await openEpubBook(dest, legacy.fileName);
          // Resolve the legacy chapter + text anchor to a whole-book location.
          let lastLocation: BookLocation | null = null;
          if (legacy.chapterHref) {
            lastLocation = await m.resolveHref(legacy.chapterHref);
            if (lastLocation && legacy.lastAnchor) {
              const anchor = legacy.lastAnchor;
              const found = m.blocks.findIndex(
                (b, i) => i >= lastLocation!.blockIndex && b.kind === 'text' && b.text.includes(anchor),
              );
              if (found !== -1) lastLocation = { blockIndex: found, offset: 0 };
            }
          }
          const meta: EpubMeta = {
            id,
            fileName: legacy.fileName,
            fileSize: sizeInfo.exists ? (sizeInfo as { size: number }).size : 0,
            // Legacy single-book state has no L2 context — leave untagged
            // (visible everywhere) until the user re-imports it.
            language: null,
            coverUrl: null,
            title: m.title,
            author: m.author,
            lastLocation,
            totalChars: m.totalChars,
            readChars: lastLocation ? m.prefixChars[lastLocation.blockIndex] ?? 0 : 0,
            lastReadAt: Date.now(),
            addedAt: Date.now(),
          };
          await m.close();
          await saveEpub(meta);
          // Remove the old single-book copy now that the library owns a handle.
          try { await FileSystem.deleteAsync(legacy.fileUri); } catch { /* already gone */ }
          await clearLegacyState();
        }
      } catch (e: any) {
        log(`[LP Mobile] EPUB legacy migration failed: ${e?.message ?? e}`);
        await clearLegacyState();
      }
    }
    setBooks(await listEpubs());
    setReady(true);
  }, []);

  useEffect(() => {
    void refreshBooks();
  }, [refreshBooks]);

  /** Import one or more EPUBs from the document picker. A single selection
   *  opens immediately; multiple selections are added to the bookshelf. */
  const pickFile = useCallback(async (importLanguage?: string) => {
    const result = await DocumentPicker.getDocumentAsync({
      // Some EPUBs (especially older ones like 鲁迅's 呐喊) are reported with
      // nonstandard MIME types; accept any file so they can be selected.
      type: '*/*',
      copyToCacheDirectory: true,
      multiple: true,
    });
    if (result.canceled || !result.assets?.length) return;
    const assets = result.assets;
    setError(null);

    let importedCount = 0;
    let firstError: string | null = null;
    // Content digests already seen in this batch, so two identical files picked
    // together only import once (same as re-importing a shelf book).
    const importedBookIds = new Set<string>();

    try {
      await ensureLibraryDir();
      for (const asset of assets) {
        const assetStart = Date.now();
        log(`[LP Mobile] 📚 import start "${asset.name}" t=${assetStart}`);
        try {
          const isZipName = /\.(epub\.)?zip$/i.test(asset.name);
          let displayName = isZipName
            ? `${asset.name.replace(/\.epub\.zip$/i, '').replace(/\.zip$/i, '')}.epub`
            : asset.name;
          // Reuse an existing shelf entry's id when the same file name is
          // re-uploaded, so pre-hash imports (stored under a non-hashed id)
          // update their handle in place instead of duplicating the entry.
          const existingEntry = books.find((b) => b.fileName === displayName);
          const id = existingEntry ? existingEntry.id : sanitizeEpubId(displayName);
          const dest = libraryFileUri(id);
          const assetInfo = await FileSystem.getInfoAsync(asset.uri);
          const existing = await FileSystem.getInfoAsync(dest);
          if (existing.exists) {
            await FileSystem.deleteAsync(dest);
          }
          if (assetInfo.isDirectory) {
            await FileSystem.makeDirectoryAsync(dest, { intermediates: true });
            await copyDirectoryContents(
              asset.uri.endsWith('/') ? asset.uri : `${asset.uri}/`,
              dest.endsWith('/') ? dest : `${dest}/`,
            );
          } else {
            await FileSystem.copyAsync({ from: asset.uri, to: dest });
          }

          if (isZipName) {
            const unwrappedName = await unwrapEpubZipFile(dest, asset.name, dest);
            if (!unwrappedName) {
              throw new Error('Not an EPUB zip');
            }
            // Use the unwrapped file's name (e.g. "X.epub", or the inner
            // .epub's own name when the zip wraps a single book file).
            displayName = unwrappedName;
          }

          // Content-hash dedupe (SPEC-065 "bookId"): skip files whose bytes
          // already match a shelf book, so a renamed copy never creates a
          // duplicate handle. The hash is computed after copy/unwrap so it is
          // over the content that will actually be stored. On a duplicate the
          // just-written file is removed and we move on — no re-parse, no new
          // shelf entry.
          const contentHash = await hashBookContent(dest);
          const duplicate = contentHash
            ? books.some((b) => b.bookId === contentHash) || importedBookIds.has(contentHash)
            : false;
          if (duplicate) {
            log(`[LP Mobile] ⏭️ skipping "${asset.name}" — already in library (${contentHash})`);
            await FileSystem.deleteAsync(dest, { idempotent: true }).catch(() => {});
            continue;
          }
          if (contentHash) importedBookIds.add(contentHash);

          // Diagnostic (import perf): attribute copy+unwrap vs parse. The
          // parse itself logs unzip/images/blocks/cover sub-phases separately.
          log(`[LP Mobile] ⏱️ import "${asset.name}": copy+unwrap ${Date.now() - assetStart}ms (isDir=${!!assetInfo.isDirectory} isZip=${isZipName})`);
          // Web parity (SPEC-049 §7): importing only parses the package
          // (title/author/TOC) + the cover — the heavy spine→blocks
          // conversion is deferred until the book is opened (openEpubBook).
          // This is why web import feels instant.
          const m = await inspectEpubBook(dest, displayName);
          let coverUrl = m.coverUrl;
          if (coverUrl?.startsWith('file://')) {
            // Persist the extracted cover next to the book (cacheDirectory
            // temp files can be purged). Both sides are already file:// URIs —
            // pass them through as-is (a second 'file://' prefix or a bare
            // path after slice(7) breaks RN Image / copyAsync).
            const ext = /\.([a-zA-Z0-9]+)$/.exec(coverUrl)?.[1] ?? 'jpg';
            const coverDest = `${LIBRARY_DIR}${id.replace(/\.epub$/i, '')}_cover.${ext}`;
            try {
              await FileSystem.copyAsync({ from: coverUrl, to: coverDest });
              coverUrl = coverDest;
            } catch { /* keep temp cover */ }
          }
          const info = await FileSystem.getInfoAsync(dest);
          const fallbackLanguage = importLanguage
            ? importLanguage.trim().split(/[-_]/)[0]?.toLowerCase() || null
            : null;
          const meta: EpubMeta = {
            id,
            // Content digest for dedupe (SPEC-065). Null when the file could
            // not be read, in which case no content dedupe applies.
            bookId: contentHash ?? undefined,
            fileName: displayName,
            fileSize: info.exists ? (info as { size: number }).size : 0,
            // Books are scoped to the L2 they were uploaded under — no OPF
            // language sniffing.
            language: fallbackLanguage,
            coverUrl,
            title: m.title,
            author: m.author,
            lastLocation: null,
            // totalChars is only known after the full openEpubBook conversion;
            // it is filled in when the book is opened (openBook). Until then the
            // shelf shows no progress % (totalChars === 0 → pct null).
            totalChars: 0,
            readChars: 0,
            lastReadAt: Date.now(),
            addedAt: Date.now(),
          };
          await saveEpub(meta);
          // Web parity (SPEC-049 §7): publish each book to the shelf as soon
          // as it is imported, so a multi-file pick shows books appearing one
          // at a time instead of a single long spinner.
          setBooks(await listEpubs());
          await m.cleanup();
          importedCount++;
          log(`[LP Mobile] 📚 import done "${asset.name}" total=${Date.now() - assetStart}ms (copy+unwrap+inspect+cover+save)`);
        } catch (e: any) {
          firstError ??= e?.message ?? String(e);
          log(`[LP Mobile] 📚 import FAILED "${asset.name}" elapsed=${Date.now() - assetStart}ms err=${e?.message ?? e}`);
        }
      }

      // Importing only adds to the bookshelf (web parity) — it never opens the
      // book. The user taps a card (or the mount auto-open) to open it.
      if (importedCount === 0) {
        setError(firstError ?? 'Failed to import EPUB');
      }
    } finally {
      setLoading(false);
    }
  }, [books]);

  /** Open a stored book; returns the location to resume at. */
  const openBook = useCallback(async (id: string, opts?: { skipCover?: boolean }): Promise<BookLocation | null> => {
    const skipCover = opts?.skipCover ?? false;
    // Opening a book clears the persisted "reader closed" latch — from here
    // on, leaving and returning resumes normally (until the next explicit
    // close).
    void clearReaderClosed(l2Ref.current).then(() => setReaderClosedState(false));
    if (openBookIdRef.current === id && modelRef.current) {
      setCoverTapped(skipCover);
      return initialLocation;
    }
    // In-flight guard (a ref, not state): a concurrent openBook for another id
    // (e.g. the mount-time auto-open racing a manual tap) would run two
    // openEpubBook passes and the losing one's error path kicks the reader
    // back to the bookshelf. Reject the second while one is loading.
    if (openLoadingRef.current) {
      log('[epub] openBook rejected — another open in flight', { id, openBookIdRef: openBookIdRef.current });
      return null;
    }
    openLoadingRef.current = true;
    setLoading(true);
    setError(null);
    log('[epub] openBook start', { id });
    try {
      const meta = books.find((b) => b.id === id) ?? (await listEpubs()).find((b) => b.id === id);
      if (!meta) { setError('Book not found'); return null; }
      const fileUri = libraryFileUri(id);
      const info = await FileSystem.getInfoAsync(fileUri);
      if (!info.exists) { setError('Book file missing'); return null; }
      const m = await openEpubBook(fileUri, meta.fileName, { coverUri: await coverUriIfExists(meta.coverUrl) });
      const resume = meta.lastLocation && meta.lastLocation.blockIndex < m.blocks.length
        ? meta.lastLocation
        : (m.markers[0]?.location ?? (m.blocks.length > 0 ? { blockIndex: 0, offset: 0 } : null));
      setCurrentModel(m, id, skipCover, resume);
      // totalChars is only known here (full openEpubBook conversion); the lazy
      // import set it to 0, so persist it now so the shelf's progress bar works.
      await updateEpubMeta(id, { lastReadAt: Date.now(), totalChars: m.totalChars });
      setBooks(prev => prev.map((b) => (b.id === id ? { ...b, lastReadAt: Date.now() } : b)));
      log('[epub] openBook finish', { id, openBookIdRef: openBookIdRef.current, skipCover });
      return resume;
    } catch (e: any) {
      log('[epub] openBook error', { id, message: e?.message ?? String(e) });
      setError(localizedError(t, e, 'error.general'));
      return null;
    } finally {
      openLoadingRef.current = false;
      setLoading(false);
    }
  }, [books, initialLocation, setCurrentModel]);

  const close = useCallback(async () => {
    log('[epub] close() — reset open book', { openBookIdRef: openBookIdRef.current });
    // Latch the reader closed for this L2 — persisted, so the bookshelf stays
    // put across tab navigation AND app relaunch (no auto-open on return)
    // until the user opens a book again (user request).
    void setReaderClosed(l2Ref.current).then(() => setReaderClosedState(true));
    await modelRef.current?.close().catch(() => {});
    modelRef.current = null;
    openBookIdRef.current = null;
    setModel(null);
    setOpenBookId(null);
    setCoverTapped(false);
    setInitialLocation(null);
    setError(null);
  }, []);

  const dismissCover = useCallback(() => setCoverTapped(true), []);

  /** Persist the current reading location + progress (chars before block). */
  const saveLocation = useCallback(async (loc: BookLocation) => {
    const m = modelRef.current;
    const id = openBookIdRef.current;
    if (!m || !id) return;
    const readChars = Math.min(
      m.totalChars,
      (m.prefixChars[loc.blockIndex] ?? 0) + loc.offset,
    );
    await updateEpubMeta(id, { lastLocation: loc, readChars, lastReadAt: Date.now() });
    setBooks(prev => prev.map((b) =>
      b.id === id ? { ...b, lastLocation: loc, readChars, lastReadAt: Date.now() } : b,
    ));
  }, []);

  const resolveHref = useCallback(async (href: string, fromHref?: string) => {
    return modelRef.current?.resolveHref(href, fromHref) ?? null;
  }, []);

  const removeBook = useCallback(async (id: string) => {
    const meta = books.find((b) => b.id === id);
    if (meta) await deleteEpub(meta);
    if (openBookIdRef.current === id) await close();
    setBooks(await listEpubs());
  }, [books, close]);

  return {
    books,
    openBookId,
    loading,
    error,
    /** Persisted explicit-close latch for this L2 (blocks auto-open). */
    readerClosed,
    toc: model?.toc ?? [],
    markers: model?.markers ?? [],
    blocks: model?.blocks ?? null,
    chapterLabels: model?.chapterLabels ?? [],
    totalChars: model?.totalChars ?? 0,
    fileName: model?.fileName ?? null,
    epubTitle: model?.title ?? '',
    epubAuthor: model?.author ?? '',
    coverUrl: model?.coverUrl ?? null,
    coverTapped,
    initialLocation,
    spineHrefs: model?.spineHrefs ?? [],
    ready,
    refreshBooks,
    pickFile,
    openBook,
    close,
    dismissCover,
    saveLocation,
    resolveHref,
    removeBook,
  };
}
