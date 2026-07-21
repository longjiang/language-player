/**
 * IndexedDB-backed storage for custom media (video/audio + captions).
 *
 * Uses the File System Access API when available to store file handles
 * instead of the full file data. This avoids IndexedDB size limits for
 * large media files. Falls back to storing files directly in IndexedDB
 * for browsers that don't support File System Access API.
 *
 * On page reload, stored file handles are queried for permission. If
 * the user previously granted persistent permission, the handle is
 * reused directly. Otherwise, the user is prompted to re-select the file.
 */

const DB_NAME = 'lp-media-store';
const DB_VERSION = 1;
const STORE_NAME = 'media';

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

// ── Types ──────────────────────────────────────────────────────────────────

/** File System Access API type (available in Chromium browsers). */
declare global {
  interface FileSystemFileHandle {
    queryPermission(descriptor?: { mode: 'read' | 'readwrite' }): Promise<'granted' | 'denied' | 'prompt'>;
    requestPermission(descriptor?: { mode: 'read' | 'readwrite' }): Promise<'granted' | 'denied'>;
    getFile(): Promise<File>;
  }
  interface Window {
    showOpenFilePicker?(options?: {
      multiple?: boolean;
      types?: { description: string; accept: Record<string, string[]> }[];
    }): Promise<FileSystemFileHandle[]>;
  }
}

export interface StoredMedia {
  /** File name (e.g. "my-video.mp4"). */
  fileName: string;
  /** MIME type (e.g. "video/mp4"). */
  mimeType: string;
  /** Whether this is audio (true) or video (false). */
  isAudio: boolean;
  /** File size in bytes. */
  fileSize: number;
  /** When the file was last opened. */
  lastOpened: number;
  /** Playback position in seconds. */
  position: number;
  /**
   * File System Access API handle, serialized.
   * Only present when the API is available and the user granted access.
   */
  fileHandle?: FileSystemFileHandle;
  /**
   * Raw file data. Only used as fallback when File System Access API
   * is not available (e.g. Firefox, Safari).
   */
  fileData?: ArrayBuffer;
  /**
   * Caption data, if any. Stored as raw SRT or WebVTT text.
   * Empty string means no captions were loaded.
   */
  captionText: string;
  /** Caption format: 'srt' or 'vtt'. */
  captionFormat: 'srt' | 'vtt' | null;
}

const KEY = 'current';

// ── CRUD Operations ────────────────────────────────────────────────────────

/** Save or update stored media. */
export async function saveMedia(media: StoredMedia): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(media, KEY);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

/** Load stored media. Returns null if nothing is stored. */
export async function loadMedia(): Promise<StoredMedia | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(KEY);
    req.onsuccess = () => { db.close(); resolve(req.result ?? null); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

/** Update media metadata without rewriting the file blob. */
export async function updateMediaMeta(
  updates: Partial<Pick<StoredMedia, 'position' | 'lastOpened' | 'captionText' | 'captionFormat'>>,
): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.get(KEY);
    getReq.onsuccess = () => {
      const existing = getReq.result as StoredMedia | undefined;
      if (!existing) { db.close(); resolve(); return; }
      store.put({ ...existing, ...updates }, KEY);
    };
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

/** Delete stored media. */
export async function deleteMedia(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(KEY);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

// ── File System Access API Helpers ─────────────────────────────────────────

/** Check if the File System Access API is available. */
export function hasFileSystemAccess(): boolean {
  return typeof window !== 'undefined' && typeof window.showOpenFilePicker === 'function';
}

/**
 * Open a file picker for media files. Returns a file handle and File object.
 * Uses File System Access API when available, otherwise falls back to
 * a hidden <input type="file">.
 */
export async function openMediaFile(): Promise<{
  file: File;
  handle?: FileSystemFileHandle;
} | null> {
  if (hasFileSystemAccess()) {
    try {
      const [handle] = await window.showOpenFilePicker!({
        multiple: false,
        types: [{
          description: 'Media files',
          accept: {
            'video/*': ['.mp4', '.webm', '.mkv', '.avi', '.mov', '.flv', '.wmv'],
            'audio/*': ['.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a', '.wma', '.opus'],
          },
        }],
      });
      if (!handle) return null;
      const file = await handle.getFile();
      return { file, handle };
    } catch (err: any) {
      if (err?.name === 'AbortError') return null;
      console.warn('File System Access API failed, using fallback:', err);
    }
  }

  // Fallback: use hidden <input>
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*,audio/*';
    input.onchange = () => {
      const file = input.files?.[0];
      resolve(file ? { file } : null);
    };
    input.click();
  });
}

/**
 * Open a file picker for caption files (.srt, .vtt).
 */
export async function openCaptionFile(): Promise<{
  text: string;
  format: 'srt' | 'vtt';
  fileName: string;
} | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.srt,.vtt';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }

      const format = file.name.endsWith('.vtt') ? 'vtt' : 'srt';
      const reader = new FileReader();
      reader.onload = () => {
        resolve({
          text: reader.result as string,
          format,
          fileName: file.name,
        });
      };
      reader.onerror = () => resolve(null);
      reader.readAsText(file);
    };
    input.click();
  });
}

/**
 * Try to re-acquire file access from a stored FileSystemFileHandle.
 * Returns the File if permission is granted or the user re-grants it.
 * Returns null if permission is denied or unavailable.
 */
export async function restoreFileFromHandle(
  handle: FileSystemFileHandle,
): Promise<File | null> {
  try {
    let permission = await handle.queryPermission({ mode: 'read' });
    if (permission !== 'granted') {
      permission = await handle.requestPermission({ mode: 'read' });
    }
    if (permission === 'granted') {
      return await handle.getFile();
    }
  } catch {
    // Handle may be invalid (file moved/deleted)
  }
  return null;
}

/**
 * Determine if a file is audio-only based on MIME type.
 */
export function isAudioFile(file: File): boolean {
  return file.type.startsWith('audio/');
}
