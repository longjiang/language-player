/**
 * IndexedDB-backed EPUB storage.
 * Stores the user's most recently opened EPUB so it persists across sessions.
 */

const DB_NAME = 'lp-epub-store';
const DB_VERSION = 1;
const STORE_NAME = 'epubs';
const KEY = 'current';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export interface EpubMeta {
  fileName: string;
  fileSize: number;
  lastChapterHref: string | null;
  lastChapterTitle: string | null;
  /** Text snippet from the first visible block on the last page. */
  lastAnchor: string | null;
}

export interface StoredEpub {
  data: ArrayBuffer;
  meta: EpubMeta;
}

/** Save the EPUB binary + metadata to IndexedDB. */
export async function saveEpub(
  arrayBuffer: ArrayBuffer,
  fileName: string,
  lastChapterHref: string | null = null,
  lastChapterTitle: string | null = null,
  lastAnchor: string | null = null,
): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(
      { data: arrayBuffer, meta: { fileName, fileSize: arrayBuffer.byteLength, lastChapterHref, lastChapterTitle, lastAnchor } },
      KEY,
    );
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

/** Load the stored EPUB from IndexedDB. */
export async function loadEpub(): Promise<StoredEpub | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(KEY);
    req.onsuccess = () => { db.close(); resolve(req.result ?? null); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

/** Update metadata without rewriting the binary blob. */
export async function updateEpubMeta(meta: Partial<EpubMeta>): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.get(KEY);
    getReq.onsuccess = () => {
      const existing = getReq.result as StoredEpub | undefined;
      if (!existing) { db.close(); resolve(); return; }
      store.put({ ...existing, meta: { ...existing.meta, ...meta } }, KEY);
    };
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

/** Delete the stored EPUB. */
export async function deleteEpub(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(KEY);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
