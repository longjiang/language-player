/**
 * IndexedDB-backed image reader gallery storage.
 *
 * Persists the image reader's gallery (each loaded image's base64 data URL +
 * OCR result + human-readable title, and the current selection) so it survives
 * navigating away or a page refresh. Images can be large (base64), so the
 * gallery is stored as a single IndexedDB record rather than localStorage.
 */

const DB_NAME = 'lp-image-reader';
const DB_VERSION = 1;
const STORE_NAME = 'gallery';
const STATE_KEY = 'state';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => {
      const db = req.result;
      // Never hold a connection that blocks another tab's upgrade.
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    // Another tab holding an older version open would otherwise leave this
    // request pending forever (every gallery read/write would hang).
    req.onblocked = () => reject(new DOMException('IndexedDB open blocked by another tab', 'BlockedError'));
  });
}

/** Persisted entry (blocks are derived from `md` on load, so they're omitted). */
export interface ImageReaderPersistedEntry {
  id: string;
  name: string;
  dataUrl: string;
  title?: string;
  md: string;
  error?: boolean;
}

export interface PersistedImageGallery {
  entries: ImageReaderPersistedEntry[];
  currentId: string | null;
}

export async function saveImageGallery(gallery: PersistedImageGallery): Promise<void> {
  const db = await openDB();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(gallery, STATE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    // Close every connection: a leaked one blocks a future version upgrade
    // (`onblocked` never settles), which is the same class of hang we avoid
    // elsewhere in the reader stores.
    db.close();
  }
}

/**
 * Load the persisted gallery, or `null` when there is nothing to restore.
 *
 * Rejects with the raw IndexedDB error when the record cannot be read at all —
 * e.g. Chromium's `NotReadableError` for a large value whose blob file was
 * deleted ("Data lost due to missing file…irrecoverable"), which is how an
 * image gallery holding several base64 images usually fails. The caller
 * classifies it (`isUnreadableRecordError`) and tells the user; the next save
 * simply overwrites the dead record, so the gallery recovers by itself.
 */
export async function loadImageGallery(): Promise<PersistedImageGallery | null> {
  const db = await openDB();
  try {
    return await new Promise<PersistedImageGallery | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(STATE_KEY);
      req.onsuccess = () => resolve((req.result as PersistedImageGallery) ?? null);
      req.onerror = () => reject(req.error);
      tx.onabort = () => reject(tx.error ?? req.error ?? new Error('gallery read aborted'));
    });
  } finally {
    db.close();
  }
}
