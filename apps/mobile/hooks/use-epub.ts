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
import { convertAltBookFormat, buildMinimalEpub } from '@langplayer/utils';
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

/** Base64 → Uint8Array (Hermes provides atob). */
function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Uint8Array → base64 (Hermes provides btoa). */
function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...Array.from(bytes.subarray(i, i + CHUNK)));
  }
  return btoa(bin);
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
  /** PDF reading session (format: 'pdf' entries) — file uri + name. */
  pdfDoc: { id: string; uri: string; fileName: string } | null;
  /** Persist a rendered cover (e.g. a PDF's first page) for a shelf entry. */
  updateCover: (id: string, coverUrl: string | null) => Promise<void>;
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
  const [pdfDoc, setPdfDoc] = useState<{ id: string; uri: string; fileName: string } | null>(null);

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
    setLoading(true);
    setError(null);

    let importedCount = 0;
    let firstError: string | null = null;
    let lastModel: EpubBookModel | null = null;
    let lastId = '';
    let lastPdf: { id: string; uri: string; fileName: string } | null = null;

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

          // Epub-like formats (.fb2/.mobi/.azw3) → convert to a minimal EPUB
          // in place; the shelf keeps the original file name.
          if (/\.(fb2|mobi|azw3)$/i.test(displayName)) {
            const b64 = await FileSystem.readAsStringAsync(dest, {
              encoding: FileSystem.EncodingType.Base64,
            });
            const content = convertAltBookFormat(base64ToBytes(b64).buffer as ArrayBuffer, displayName);
            if (!content) throw new Error('Unsupported alt book format');
            const epubBytes = await buildMinimalEpub(content);
            await FileSystem.writeAsStringAsync(dest, bytesToBase64(new Uint8Array(epubBytes)), {
              encoding: FileSystem.EncodingType.Base64,
            });
            log('[epub] alt format converted to epub', { name: displayName, title: content.title });
          }

          // PDF: copy done above — the first page becomes the shelf cover
          // (rendered lazily by the reader screen; stored once available).
          if (/\.pdf$/i.test(displayName)) {
            const info2 = await FileSystem.getInfoAsync(dest);
            const existingEntry2 = books.find((b) => b.id === id);
            const fallbackLanguage2 = importLanguage
              ? importLanguage.trim().split(/[-_]/)[0]?.toLowerCase() || null
              : null;
            const pdfMeta: EpubMeta = {
              id,
              fileName: displayName,
              fileSize: info2.exists ? (info2 as { size: number }).size : 0,
              format: 'pdf',
              language: fallbackLanguage2,
              coverUrl: existingEntry2?.coverUrl ?? null,
              title: displayName.replace(/\.pdf$/i, ''),
              author: '',
              lastLocation: null,
              totalChars: 0,
              readChars: 0,
              lastReadAt: Date.now(),
              addedAt: Date.now(),
            };
            await saveEpub(pdfMeta);
            importedCount++;
            lastId = id;
            lastPdf = { id, uri: dest, fileName: displayName };
            log(`[LP Mobile] 📄 pdf import done "${asset.name}"`);
            continue;
          }

          const m = await openEpubBook(dest, displayName);
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
          log(`[LP Mobile] 📚 import done "${asset.name}" total=${Date.now() - assetStart}ms (copy+unwrap+open+cover+save)`);
        } catch (e: any) {
          firstError ??= e?.message ?? String(e);
          log(`[LP Mobile] 📚 import FAILED "${asset.name}" elapsed=${Date.now() - assetStart}ms err=${e?.message ?? e}`);
        }
      }

      setBooks(await listEpubs());

      if (importedCount === 0) {
        setError(firstError ?? 'Failed to import EPUB');
      } else if (importedCount === 1 && lastPdf) {
        // Single PDF import → open the thumbnails grid directly.
        setPdfDoc(lastPdf);
        setOpenBookId(lastPdf.id);
        setCoverTapped(true);
        log('[epub] pdf auto-open', { id: lastPdf.id });
      } else if (importedCount === 1 && lastModel) {
        const start: BookLocation | null =
          lastModel.markers[0]?.location ??
          (lastModel.blocks.length > 0 ? { blockIndex: 0, offset: 0 } : null);
        setCurrentModel(lastModel, lastId, false, start);
      }
    } finally {
      setLoading(false);
    }
  }, [books, setCurrentModel]);

  /** Open a stored book; returns the location to resume at. */
  const openBook = useCallback(async (id: string, opts?: { skipCover?: boolean }): Promise<BookLocation | null> => {
    const skipCover = opts?.skipCover ?? false;
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

      // PDF entries: no block model — the reader shows the thumbnails grid.
      if (meta.format === 'pdf') {
        setPdfDoc({ id, uri: fileUri, fileName: meta.fileName });
        setOpenBookId(id);
        setCoverTapped(true);
        await updateEpubMeta(id, { lastReadAt: Date.now() });
        return null;
      }

      const m = await openEpubBook(fileUri, meta.fileName, { coverUri: await coverUriIfExists(meta.coverUrl) });
      const resume = meta.lastLocation && meta.lastLocation.blockIndex < m.blocks.length
        ? meta.lastLocation
        : (m.markers[0]?.location ?? (m.blocks.length > 0 ? { blockIndex: 0, offset: 0 } : null));
      setCurrentModel(m, id, skipCover, resume);
      await updateEpubMeta(id, { lastReadAt: Date.now() });
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
    await modelRef.current?.close().catch(() => {});
    modelRef.current = null;
    openBookIdRef.current = null;
    setModel(null);
    setPdfDoc(null);
    setOpenBookId(null);
    setCoverTapped(false);
    setInitialLocation(null);
    setError(null);
  }, []);

  /** Persist a rendered cover (e.g. a PDF's first page) for a shelf entry. */
  const updateCover = useCallback(async (id: string, coverUrl: string | null) => {
    await updateEpubMeta(id, { coverUrl });
    setBooks((prev) => prev.map((b) => (b.id === id ? { ...b, coverUrl } : b)));
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
    pdfDoc,
    updateCover,
    close,
    dismissCover,
    saveLocation,
    resolveHref,
    removeBook,
  };
}
