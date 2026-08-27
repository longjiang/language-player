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
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
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
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(gallery, STATE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadImageGallery(): Promise<PersistedImageGallery | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(STATE_KEY);
    req.onsuccess = () => resolve((req.result as PersistedImageGallery) ?? null);
    req.onerror = () => reject(req.error);
  });
}
