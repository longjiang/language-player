import { useState, useCallback, useRef, useEffect } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import {
  openEpubBook,
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
  type EpubMeta,
  type EpubSummary,
} from '@/lib/epub-store';
import type { TocItem } from '@/lib/epub-parser';
import type { ContentBlock } from '@/lib/parse-markdown';
import { log } from '@/lib/logger';
import { useT } from '@/hooks/use-t';
import { localizedError } from '@/lib/errors';

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

export function useEpub(): UseEpubReturn {
  const t = useT();
  const [books, setBooks] = useState<EpubSummary[]>([]);
  const [openBookId, setOpenBookId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState<EpubBookModel | null>(null);
  const [coverTapped, setCoverTapped] = useState(false);
  const [initialLocation, setInitialLocation] = useState<BookLocation | null>(null);
  const [ready, setReady] = useState(false);

  const modelRef = useRef<EpubBookModel | null>(null);
  const openBookIdRef = useRef<string | null>(null);
  const migratedRef = useRef(false);

  const setCurrentModel = useCallback((m: EpubBookModel, id: string, skipCover: boolean, resume: BookLocation | null) => {
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
    setLoading(true);
    setError(null);

    let importedCount = 0;
    let firstError: string | null = null;
    let lastModel: EpubBookModel | null = null;
    let lastId = '';

    try {
      await ensureLibraryDir();
      for (const asset of assets) {
        try {
          const isZipName = /\.(epub\.)?zip$/i.test(asset.name);
          let displayName = isZipName
            ? `${asset.name.replace(/\.epub\.zip$/i, '').replace(/\.zip$/i, '')}.epub`
            : asset.name;
          const id = sanitizeEpubId(displayName);
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

          const m = await openEpubBook(dest, displayName);
          let coverUrl = m.coverUrl;
          if (coverUrl?.startsWith('file://')) {
            const src = coverUrl.slice(7);
            const ext = src.split('.').pop() ?? 'jpg';
            const coverDest = `${LIBRARY_DIR}${id.replace(/\.epub$/i, '')}_cover.${ext}`;
            try {
              await FileSystem.copyAsync({ from: src, to: coverDest });
              coverUrl = 'file://' + coverDest;
            } catch { /* keep temp cover */ }
          }
          const info = await FileSystem.getInfoAsync(dest);
          const fallbackLanguage = importLanguage
            ? importLanguage.trim().split(/[-_]/)[0]?.toLowerCase() || null
            : null;
          const meta: EpubMeta = {
            id,
            fileName: displayName,
            fileSize: info.exists ? (info as { size: number }).size : 0,
            // Books are scoped to the L2 they were uploaded under — no OPF
            // language sniffing.
            language: fallbackLanguage,
            coverUrl,
            title: m.title,
            author: m.author,
            lastLocation: null,
            totalChars: m.totalChars,
            readChars: 0,
            lastReadAt: Date.now(),
            addedAt: Date.now(),
          };
          await saveEpub(meta);
          importedCount++;
          lastModel = m;
          lastId = id;
        } catch (e: any) {
          firstError ??= e?.message ?? String(e);
        }
      }

      setBooks(await listEpubs());

      if (importedCount === 0) {
        setError(firstError ?? 'Failed to import EPUB');
      } else if (importedCount === 1 && lastModel) {
        const start: BookLocation | null =
          lastModel.markers[0]?.location ??
          (lastModel.blocks.length > 0 ? { blockIndex: 0, offset: 0 } : null);
        setCurrentModel(lastModel, lastId, false, start);
      }
    } finally {
      setLoading(false);
    }
  }, [setCurrentModel]);

  /** Open a stored book; returns the location to resume at. */
  const openBook = useCallback(async (id: string, opts?: { skipCover?: boolean }): Promise<BookLocation | null> => {
    const skipCover = opts?.skipCover ?? false;
    if (openBookIdRef.current === id && modelRef.current) {
      setCoverTapped(skipCover);
      return initialLocation;
    }
    setLoading(true);
    setError(null);
    try {
      const meta = books.find((b) => b.id === id) ?? (await listEpubs()).find((b) => b.id === id);
      if (!meta) { setError('Book not found'); return null; }
      const fileUri = libraryFileUri(id);
      const info = await FileSystem.getInfoAsync(fileUri);
      if (!info.exists) { setError('Book file missing'); return null; }
      const m = await openEpubBook(fileUri, meta.fileName, { coverUri: meta.coverUrl });
      const resume = meta.lastLocation && meta.lastLocation.blockIndex < m.blocks.length
        ? meta.lastLocation
        : (m.markers[0]?.location ?? (m.blocks.length > 0 ? { blockIndex: 0, offset: 0 } : null));
      setCurrentModel(m, id, skipCover, resume);
      await updateEpubMeta(id, { lastReadAt: Date.now() });
      setBooks(prev => prev.map((b) => (b.id === id ? { ...b, lastReadAt: Date.now() } : b)));
      return resume;
    } catch (e: any) {
      setError(localizedError(t, e, 'error.general'));
      return null;
    } finally {
      setLoading(false);
    }
  }, [books, initialLocation, setCurrentModel]);

  const close = useCallback(async () => {
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
