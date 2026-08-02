/**
 * IndexedDB-backed EPUB storage.
 * Stores every EPUB the user has opened so they persist across sessions and
 * can be resumed from the bookshelf. Each book is keyed by a stable id derived
 * from the file contents (SHA-256), so re-uploading the same file updates the
 * same handle instead of creating a duplicate.
 */

const DB_NAME = 'lp-epub-store';
const DB_VERSION = 2;
const STORE_NAME = 'epubs';
/** Per-book chapter plain text, used by the in-reader search index. */
const TEXTS_STORE_NAME = 'chapter-texts';
/** Bump when the search index format changes — stale caches are rebuilt. */
const SEARCH_INDEX_VERSION = 1;
/** Key used by the previous single-book version — migrated to a per-book key. */
const LEGACY_KEY = 'current';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
      if (!db.objectStoreNames.contains(TEXTS_STORE_NAME)) db.createObjectStore(TEXTS_STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export interface EpubMeta {
  /** Stable id derived from the file contents (SHA-256 hex). */
  id: string;
  fileName: string;
  fileSize: number;
  /** Cover image as a data URL — shown on the bookshelf without reopening the book. */
  coverUrl: string | null;
  lastChapterHref: string | null;
  lastChapterTitle: string | null;
  /** Text snippet from the first visible block on the last page. */
  lastAnchor: string | null;
  /** Characters read within the current chapter (anchor offset). */
  lastAnchorOffset: number;
  /** Plain-text character count per TOC href — used to compute progress. */
  chapterCharCounts: Record<string, number>;
  /** Total plain-text characters in the book. */
  totalChars: number;
  /** Characters read so far (prefix of chapters + current offset). */
  readChars: number;
  /** Unix ms of the last time the book was opened/read. */
  lastReadAt: number;
  /** Unix ms when the book was first added. */
  addedAt: number;
}

export interface StoredEpub {
  id: string;
  data: ArrayBuffer;
  meta: EpubMeta;
}

/** Bookshelf view — metadata only, no binary data. */
export type EpubSummary = EpubMeta;

/** SHA-256 hex digest of an ArrayBuffer. */
export async function sha256Hex(data: ArrayBuffer): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Non-secure context fallback — deterministic per file name + size.
  return `fn-${data.byteLength}`;
}

function baseMeta(id: string, fileName: string, fileSize: number): EpubMeta {
  const now = Date.now();
  return {
    id,
    fileName,
    fileSize,
    coverUrl: null,
    lastChapterHref: null,
    lastChapterTitle: null,
    lastAnchor: null,
    lastAnchorOffset: 0,
    chapterCharCounts: {},
    totalChars: 0,
    readChars: 0,
    lastReadAt: now,
    addedAt: now,
  };
}

/**
 * Upsert a stored EPUB, merging with any existing record so progress fields
 * survive re-uploads of the same file.
 */
export async function saveEpub(
  id: string,
  arrayBuffer: ArrayBuffer,
  meta: Partial<EpubMeta>,
): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const existing = getReq.result as StoredEpub | undefined;
      const base = existing?.meta ?? baseMeta(id, meta.fileName ?? 'book.epub', arrayBuffer.byteLength);
      const merged: EpubMeta = {
        ...base,
        ...meta,
        id,
        fileName: meta.fileName ?? base.fileName,
        fileSize: arrayBuffer.byteLength,
      };
      store.put({ id, data: arrayBuffer, meta: merged }, id);
    };
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

/** Load a stored EPUB by id. */
export async function loadEpub(id: string): Promise<StoredEpub | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(id);
    req.onsuccess = () => { db.close(); resolve(req.result ?? null); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

/**
 * List all stored books (metadata only), sorted by last read (most recent
 * first). Migrates records written by the previous single-book version.
 */
export async function listEpubs(): Promise<EpubSummary[]> {
  const db = await openDB();
  const records: Array<{ key: IDBValidKey; value: StoredEpub }> = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.openCursor();
    const out: Array<{ key: IDBValidKey; value: StoredEpub }> = [];
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        out.push({ key: cursor.key, value: cursor.value as StoredEpub });
        cursor.continue();
      } else {
        resolve(out);
      }
    };
    req.onerror = () => reject(req.error);
  });
  db.close();

  const summaries: EpubSummary[] = [];
  for (const rec of records) {
    const isLegacy = rec.key === LEGACY_KEY || !rec.value?.meta?.id;
    if (isLegacy) {
      try {
        const value = rec.value;
        const id = await sha256Hex(value.data);
        const old = value.meta ?? {};
        await saveEpub(id, value.data, {
          ...old,
          id,
          fileName: old.fileName ?? 'book.epub',
          coverUrl: old.coverUrl ?? null,
          lastAnchorOffset: old.lastAnchorOffset ?? 0,
          chapterCharCounts: old.chapterCharCounts ?? {},
          totalChars: old.totalChars ?? 0,
          readChars: old.readChars ?? 0,
          lastReadAt: old.lastReadAt ?? Date.now(),
          addedAt: old.addedAt ?? Date.now(),
        });
        await deleteEpub(rec.key as string);
        const stored = await loadEpub(id);
        if (stored) {
          const meta = { ...stored.meta };
          if (meta.coverUrl?.startsWith('blob:')) meta.coverUrl = null;
          summaries.push(meta);
        }
      } catch { /* skip unreadable legacy record */ }
    } else {
      const meta = { ...rec.value.meta };
      // blob: URLs die on refresh — treat any leftover as no cover.
      if (meta.coverUrl?.startsWith('blob:')) meta.coverUrl = null;
      summaries.push(meta);
    }
  }

  summaries.sort((a, b) => (b.lastReadAt ?? 0) - (a.lastReadAt ?? 0));
  return summaries;
}

/** Update metadata without rewriting the binary blob. */
export async function updateEpubMeta(id: string, meta: Partial<EpubMeta>): Promise<void> {
  if (!id) return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const existing = getReq.result as StoredEpub | undefined;
      if (!existing) { db.close(); resolve(); return; }
      store.put({ ...existing, meta: { ...existing.meta, ...meta } }, id);
    };
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

/** Delete a stored EPUB by id. */
export async function deleteEpub(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

/** Store per-chapter plain text (search index) keyed by book id. */
export async function saveChapterTexts(id: string, texts: Record<string, string>): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TEXTS_STORE_NAME, 'readwrite');
    tx.objectStore(TEXTS_STORE_NAME).put({ v: SEARCH_INDEX_VERSION, texts }, id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

/** Load a book's chapter texts, or null if not indexed yet. */
export async function loadChapterTexts(id: string): Promise<Record<string, string> | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TEXTS_STORE_NAME, 'readonly');
    const req = tx.objectStore(TEXTS_STORE_NAME).get(id);
    req.onsuccess = () => {
      const rec = req.result as { v?: number; texts?: Record<string, string> } | null;
      db.close();
      if (!rec || rec.v !== SEARCH_INDEX_VERSION) { resolve(null); return; }
      const texts = rec.texts ?? {};
      // Ignore caches that extracted no text (e.g. from the body bug) so they
      // get rebuilt instead of poisoning searches.
      if (!Object.values(texts).some(t => t.length > 0)) { resolve(null); return; }
      resolve(texts);
    };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

/** Remove a book's search index. */
export async function deleteChapterTexts(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TEXTS_STORE_NAME, 'readwrite');
    tx.objectStore(TEXTS_STORE_NAME).delete(id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
