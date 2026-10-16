/**
 * IndexedDB-backed EPUB storage.
 * Stores every EPUB the user has opened so they persist across sessions and
 * can be resumed from the bookshelf. Each book is keyed by a stable id derived
 * from the file contents (SHA-256), so re-uploading the same file updates the
 * same handle instead of creating a duplicate.
 *
 * A book's binary is a *large* value, which Chromium keeps in a separate file
 * on disk rather than inline in LevelDB. Disk-cleanup tools delete those files
 * while the LevelDB reference survives, which makes the record permanently
 * unreadable: `get()` fails with a DOMException named `NotReadableError`
 * ("Data lost due to missing file. Affected record should be considered
 * irrecoverable"). Two consequences are designed for here:
 *
 * 1. The **metadata mirror** (`lp-epub-meta`) keeps the small per-book metadata
 *    in a separate database, so the bookshelf can still list (and name, and
 *    badge) a book whose binary is gone. The shelf must never read the blob to
 *    render a card.
 * 2. A failed per-record read is **isolated**: it marks that one book as
 *    unavailable instead of rejecting the whole list (which used to leave the
 *    reader on a spinner forever) and is classified as irrecoverable vs
 *    transient, so the UI can offer the recovery (Remove → re-import).
 */

import type { BookLocation } from '@/lib/epub-book-types';
import { epubLog, epubStorageErr, epubWarn } from '@/lib/epub-log';

const DB_NAME = 'lp-epub-store';
const DB_VERSION = 3;
const STORE_NAME = 'epubs';
/** Per-book whole-book search index (one record per spine item). */
const INDEX_STORE_NAME = 'book-index';
/** Bump when the search index format changes — stale caches are rebuilt. */
const SEARCH_INDEX_VERSION = 3;
/** Key used by the previous single-book version — migrated to a per-book key. */
const LEGACY_KEY = 'current';

/**
 * Metadata mirror. It lives in its OWN database (not a new object store on
 * `lp-epub-store`) on purpose: bumping that database's version would make an
 * old tab's open connection block the upgrade and hang every read (see
 * `openDB`'s `onblocked` handler).
 *
 * It holds two rows per book — `meta:<id>` with the essential (tiny) metadata
 * and `cover:<id>` with the cover data URL, which is large enough to become an
 * external blob file of its own. Keeping them apart is what lets a deleted blob
 * file cost a cover instead of the book's name (see the key helpers below).
 */
const META_DB_NAME = 'lp-epub-meta';
const META_STORE_NAME = 'epub-meta';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
      if (!db.objectStoreNames.contains(INDEX_STORE_NAME)) db.createObjectStore(INDEX_STORE_NAME);
    };
    req.onsuccess = () => {
      const db = req.result;
      // Never hold a connection that blocks another tab's upgrade.
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    // Another tab is holding an older version open: without this the request
    // never settles and every storage read awaits forever (the spinner hang).
    req.onblocked = () => {
      epubStorageErr('library DB open blocked by another tab (close other Language Player tabs and reload)');
      reject(new DOMException('IndexedDB open blocked by another tab', 'BlockedError'));
    };
  });
}

/** Open the small-value metadata mirror DB. */
function openMetaDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(META_DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(META_STORE_NAME)) db.createObjectStore(META_STORE_NAME);
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => {
      reject(new DOMException('IndexedDB metadata open blocked by another tab', 'BlockedError'));
    };
  });
}

/** Throttle for mirror-failure logs (a broken mirror fails on every write). */
let metaMirrorWarned = false;

/**
 * Books already reported as unreadable in this session. Each new loss is
 * reported once on the error channel; later loads (and the count dropping after
 * a removal) stay at info level — the shelf badges are the user-facing signal.
 */
const reportedUnreadable = new Set<string>();

/**
 * Mirror row keys. The mirror holds TWO rows per book:
 *
 * - `meta:<id>` — the small, essential metadata (name, progress, last location).
 *   Tiny enough to stay inline in LevelDB, so it survives the blob-file
 *   deletion that makes large values unreadable.
 * - `cover:<id>` — the cover data URL, which is **large** (a real 268 KB novel's
 *   cover measured 114,515 bytes of base64 — enough to push a combined row into
 *   an external blob file, defeating the whole point of the mirror). Keeping it
 *   in its own row means losing it costs a cover, never the book's name.
 */
const META_PREFIX = 'meta:';
const COVER_PREFIX = 'cover:';
const metaKey = (id: string) => `${META_PREFIX}${id}`;
const coverKey = (id: string) => `${COVER_PREFIX}${id}`;

/** All keys of a small-value store. Keys never live in a blob file. */
function keysOf(db: IDBDatabase, store: string): Promise<IDBValidKey[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAllKeys();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.onabort = () => reject(tx.error ?? new Error('key listing aborted'));
  });
}

/** Read one value. Rejects when that row cannot be read (isolated per row). */
function valueOf(db: IDBDatabase, store: string, key: IDBValidKey): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
    tx.onabort = () => reject(tx.error ?? req.error ?? new Error('read aborted'));
  });
}

/**
 * Best-effort metadata mirror read. Never rejects.
 *
 * Keys are listed first and each row is read on its own, so one unreadable row
 * (e.g. a cover whose blob file was deleted) costs only that row instead of
 * aborting the walk and losing every book after it. Cover rows are read only
 * for books whose metadata row was found, so an orphaned cover (a large value)
 * is never read.
 */
async function readAllMeta(): Promise<Map<string, EpubMeta>> {
  const out = new Map<string, EpubMeta>();
  let db: IDBDatabase | null = null;
  try {
    db = await openMetaDB();
    const keys = (await keysOf(db, META_STORE_NAME)).map(String);
    const coverKeys = keys.filter((k) => k.startsWith(COVER_PREFIX));
    const metaKeys = keys.filter((k) => !k.startsWith(COVER_PREFIX));

    for (const key of metaKeys) {
      try {
        const meta = (await valueOf(db, META_STORE_NAME, key)) as EpubMeta | null;
        if (meta?.id) out.set(meta.id, meta);
      } catch (err) {
        // Not fatal: the caller falls back to reading that book's record.
        warnMirrorOnce(`metadata mirror row "${key}" could not be read — falling back to the book records: ${errText(err)}`);
      }
    }

    for (const key of coverKeys) {
      const id = key.slice(COVER_PREFIX.length);
      if (!out.has(id)) continue;
      try {
        const row = (await valueOf(db, META_STORE_NAME, key)) as { coverUrl?: string } | null;
        const meta = out.get(id);
        if (row?.coverUrl && meta && !meta.coverUrl) meta.coverUrl = row.coverUrl;
      } catch (err) {
        warnMirrorOnce(`mirrored cover for ${id} could not be read (shelf shows a placeholder): ${errText(err)}`);
      }
    }
  } catch (err) {
    warnMirrorOnce(`metadata mirror unavailable — shelf falls back to the book records: ${errText(err)}`);
  } finally {
    db?.close();
  }
  return out;
}

/** Log the first mirror problem of the session (one is enough to diagnose). */
function warnMirrorOnce(message: string): void {
  if (metaMirrorWarned) return;
  metaMirrorWarned = true;
  epubStorageErr(message);
}

/** Write one mirror row in its own transaction (best effort). */
async function putMirrorRow(
  db: IDBDatabase,
  key: string,
  value: unknown,
  onError: (err: unknown) => void,
): Promise<void> {
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(META_STORE_NAME, 'readwrite');
      tx.objectStore(META_STORE_NAME).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch (err) {
    onError(err);
  }
}

/**
 * Best-effort metadata mirror write (never rejects, never blocks a save).
 *
 * The essential row is written first, in its own transaction, so a cover that
 * fails to store (quota, or the store refusing a large value) cannot take it
 * down.
 */
async function writeMetaRow(meta: EpubMeta): Promise<void> {
  let db: IDBDatabase | null = null;
  try {
    db = await openMetaDB();
    await putMirrorRow(db, metaKey(meta.id), { ...meta, coverUrl: null }, (err) => {
      warnMirrorOnce(`could not write the metadata mirror (shelf falls back to the book records): ${errText(err)}`);
    });
    if (meta.coverUrl) {
      await putMirrorRow(db, coverKey(meta.id), { id: meta.id, coverUrl: meta.coverUrl }, (err) => {
        warnMirrorOnce(`could not mirror a cover image (the shelf shows a placeholder): ${errText(err)}`);
      });
    }
  } catch (err) {
    warnMirrorOnce(`metadata mirror unavailable — shelf falls back to the book records: ${errText(err)}`);
  } finally {
    db?.close();
  }
}

/** Best-effort metadata mirror delete (the book row and its cover row). */
async function deleteMetaRow(id: string): Promise<void> {
  let db: IDBDatabase | null = null;
  try {
    db = await openMetaDB();
    await new Promise<void>((resolve) => {
      const tx = db!.transaction(META_STORE_NAME, 'readwrite');
      const store = tx.objectStore(META_STORE_NAME);
      store.delete(metaKey(id));
      store.delete(coverKey(id));
      store.delete(id); // legacy bare-id row, if one exists
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } catch {
    /* nothing to clean up */
  } finally {
    db?.close();
  }
}

function errText(err: unknown): string {
  if (!err || typeof err !== 'object') return String(err);
  const e = err as { name?: unknown; message?: unknown };
  return `${String(e.name ?? 'Error')}: ${String(e.message ?? '')}`;
}

/**
 * Whether an IndexedDB error means the record can never be read again.
 *
 * Chrome 132+ reports a large-value read failure whose blob file is missing
 * from disk as `NotReadableError` — "Data lost due to missing file. Affected
 * record should be considered irrecoverable". Chrome 130/131 reported the same
 * condition as `NotFoundError` with the older "Failed to read large IndexedDB
 * value" message. Everything else (`UnknownError` / `DataError` — a transient
 * read failure, or a generic failure) is retryable, never treated as lost data.
 */
export function isUnreadableRecordError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: unknown; message?: unknown };
  const name = typeof e.name === 'string' ? e.name : '';
  if (name === 'NotReadableError') return true;
  const message = typeof e.message === 'string' ? e.message : '';
  return name === 'NotFoundError' && /Failed to read large IndexedDB value/i.test(message);
}


export interface EpubMeta {
  /** Stable id derived from the file contents (SHA-256 hex). */
  id: string;
  fileName: string;
  fileSize: number;
  /** Book container format. PDFs live on the same shelf with their first
   *  page as the cover; legacy entries default to 'epub'. */
  format?: 'epub' | 'pdf';
  /** L2 the book was uploaded under (normalized primary subtag), or null
   *  for legacy books imported before per-L2 tagging. */
  language: string | null;
  /** Cover image as a data URL — shown on the bookshelf without reopening the book. */
  coverUrl: string | null;
  /** Last reading position in the book-model block stream. */
  lastLocation: BookLocation | null;
  /** Bump when the location model changes — stale positions are re-resolved. */
  locationFormatVersion: number;
  /** Legacy fields — kept for migration of pre-v3 handles. */
  lastChapterHref: string | null;
  lastChapterTitle: string | null;
  lastAnchor: string | null;
  lastAnchorOffset: number;
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
export interface EpubSummary extends EpubMeta {
  /**
   * Set when the book's stored record could not be read at all (its binary
   * file is gone, or the read failed). The card is rendered as a recoverable
   * tombstone: it can be opened (which reports the error) or removed.
   *
   * `'unreadable'` — the record is irrecoverable (Chrome `NotReadableError`, or
   * the pre-132 `NotFoundError` equivalent); `'error'` — the read failed for
   * some other (possibly transient) reason.
   */
  unavailable?: 'unreadable' | 'error';
}

/** Placeholder metadata for a record we know exists but cannot read. */
function unavailableSummary(id: string, err: unknown): EpubSummary {
  const now = Date.now();
  return {
    id,
    fileName: '',
    fileSize: 0,
    format: 'epub',
    language: null,
    coverUrl: null,
    lastLocation: null,
    locationFormatVersion: 1,
    lastChapterHref: null,
    lastChapterTitle: null,
    lastAnchor: null,
    lastAnchorOffset: 0,
    totalChars: 0,
    readChars: 0,
    lastReadAt: 0,
    addedAt: now,
    unavailable: isUnreadableRecordError(err) ? 'unreadable' : 'error',
  };
}

/** Clear `blob:` covers (they die on refresh) before a summary is returned. */
function normalizeSummary(meta: EpubMeta, unavailable?: 'unreadable' | 'error'): EpubSummary {
  const summary: EpubSummary = { ...meta };
  if (summary.coverUrl?.startsWith('blob:')) summary.coverUrl = null;
  if (unavailable) summary.unavailable = unavailable;
  return summary;
}

/** Whole-book search index record — one per spine item. */
export interface SpineIndexRecord {
  spineIndex: number;
  /** Normalized plain text of the spine item (text blocks joined with '\n'). */
  text: string;
  /** Char offset of each reader block's start inside `text`. One entry per
   *  block (index-aligned with the reader block stream); image/pre/code
   *  blocks contribute no characters and repeat the current position. */
  starts: number[];
}

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
    format: 'epub',
    language: null,
    coverUrl: null,
    lastLocation: null,
    locationFormatVersion: 1,
    lastChapterHref: null,
    lastChapterTitle: null,
    lastAnchor: null,
    lastAnchorOffset: 0,
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
  let merged: EpubMeta | null;
  try {
    merged = await writeEpubRecord(id, arrayBuffer, meta, true);
  } catch (err) {
    // Reading the existing record failed — most often because its blob file is
    // gone (NotReadableError), which aborts the whole transaction and takes the
    // `put` with it. The save is a *replacement*, so retry without the merge:
    // the incoming bytes and metadata are authoritative.
    epubWarn(`saveEpub: could not merge with the existing record (${errText(err)}) — writing a fresh one`);
    merged = await writeEpubRecord(id, arrayBuffer, meta, false);
  }
  // Mirror after the record is durably written (best effort — see writeMetaRow).
  if (merged) await writeMetaRow(merged);
}

/**
 * One write attempt. `merge` reads the existing record first so progress
 * fields survive a re-upload; the read can fail (see `saveEpub`) which aborts
 * the transaction, so the caller retries with `merge = false`.
 */
function writeEpubRecord(
  id: string,
  arrayBuffer: ArrayBuffer,
  meta: Partial<EpubMeta>,
  merge: boolean,
): Promise<EpubMeta> {
  return openDB().then((db) => new Promise<EpubMeta>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    let out: EpubMeta | null = null;
    let readError: unknown = null;

    const put = (existing?: StoredEpub) => {
      const base = existing?.meta ?? baseMeta(id, meta.fileName ?? 'book.epub', arrayBuffer.byteLength);
      out = {
        ...base,
        ...meta,
        id,
        fileName: meta.fileName ?? base.fileName,
        fileSize: arrayBuffer.byteLength,
      };
      store.put({ id, data: arrayBuffer, meta: out }, id);
    };

    if (merge) {
      const getReq = store.get(id);
      getReq.onsuccess = () => put(getReq.result as StoredEpub | undefined);
      getReq.onerror = () => { readError = getReq.error; };
    } else {
      put(undefined);
    }

    tx.oncomplete = () => { db.close(); resolve(out!); };
    tx.onerror = tx.onabort = () => {
      db.close();
      reject(tx.error ?? readError ?? new Error('EPUB save failed'));
    };
  }));
}

/** Load a stored EPUB by id. */
export async function loadEpub(id: string): Promise<StoredEpub | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(id);
    req.onsuccess = () => { db.close(); resolve(req.result ?? null); };
    // `NotReadableError` here means the record's blob file is gone — the
    // caller classifies it with `isUnreadableRecordError`.
    req.onerror = () => { db.close(); reject(req.error); };
    tx.onabort = () => { db.close(); reject(tx.error ?? req.error ?? new Error('read aborted')); };
  });
}

/**
 * List all stored books (metadata only), sorted by last read (most recent
 * first). Migrates records written by the previous single-book version.
 *
 * Never fails because ONE record is unreadable. The metadata mirror is read
 * first (small values — a book whose binary file was deleted still lists,
 * names, and keeps its progress); only records that predate the mirror (or
 * whose mirror row was lost) are read out of the big store, one transaction at
 * a time, with the failure isolated to that record and surfaced as an
 * `unavailable` summary the shelf can badge and remove.
 */
export async function listEpubs(): Promise<EpubSummary[]> {
  const mirror = await readAllMeta();
  const summaries: EpubSummary[] = [];
  const seen = new Set<string>();
  /** Books whose record could not be read during this listing. */
  const unreadable: Array<{ id: string; err: unknown }> = [];
  let bookCount = 0;
  let db: IDBDatabase | null = null;

  try {
    db = await openDB();
  } catch (err) {
    // The library DB itself could not be opened (e.g. blocked by another tab).
    // Still show the shelf from the mirror so the reader is never a spinner.
    epubStorageErr(`could not open the library DB — listing from the metadata mirror instead: ${errText(err)}`);
    for (const meta of mirror.values()) summaries.push(normalizeSummary(meta));
    return summaries.sort((a, b) => (b.lastReadAt ?? 0) - (a.lastReadAt ?? 0));
  }

  try {
    const keys = await listKeys(db);
    for (const key of keys) {
      if (typeof key === 'string') seen.add(key);
    }

    for (const key of keys) {
      const id = String(key);
      bookCount++;
      if (key === LEGACY_KEY) {
        const migrated = await migrateLegacyEpub(db, id);
        if (migrated) {
          summaries.push(migrated);
          seen.delete(LEGACY_KEY);
          seen.add(migrated.id);
        }
        continue;
      }
      const mirrored = mirror.get(id);
      if (mirrored) {
        // Fast path — and the only path that survives a deleted blob file.
        summaries.push(normalizeSummary(mirrored));
        continue;
      }
      // Pre-mirror record: read its metadata out of the big store once.
      try {
        const rec = await readRecord(db, key);
        if (!rec?.meta) continue;
        // Mirror it before returning, so the next load never has to read the
        // blob again (and survives that blob being deleted).
        await writeMetaRow(rec.meta);
        summaries.push(normalizeSummary(rec.meta));
      } catch (err) {
        // Detail on the info channel; the aggregate below is what goes to the
        // error channel (one line per shelf load, not one per broken book —
        // a profile whose blob files were cleaned up can easily have dozens).
        epubLog(`book ${id} could not be read — marking it unavailable: ${errText(err)}`);
        unreadable.push({ id, err });
        summaries.push(unavailableSummary(id, err));
      }
    }
  } finally {
    db.close();
  }

  if (unreadable.length > 0) {
    const message =
      `${unreadable.length} of ${bookCount} stored book(s) can no longer be read ` +
      `(marked unavailable; the user can remove them and import the files again) — ` +
      `first: book ${unreadable[0]!.id}: ${errText(unreadable[0]!.err)}`;
    const ids = unreadable.map((u) => u.id);
    // Report each NEW loss once per session, on the error channel. The shelf
    // already shows the condition as badges, so repeating it on every load (and
    // again after each removal, when the count merely drops) is noise a user
    // reads as "the app keeps erroring". Repeat loads keep the detail at info
    // level, which is where diagnostics belong.
    const fresh = ids.filter((id) => !reportedUnreadable.has(id));
    if (fresh.length > 0) {
      epubStorageErr(message);
      for (const id of fresh) reportedUnreadable.add(id);
    } else {
      epubLog(message);
    }
    // Forget books that are readable (or gone) again, so a later loss of the
    // same book is reported afresh.
    for (const id of [...reportedUnreadable]) {
      if (!ids.includes(id)) reportedUnreadable.delete(id);
    }
  } else {
    reportedUnreadable.clear();
  }

  // Prune mirror rows whose book record no longer exists (best effort).
  for (const id of mirror.keys()) {
    if (!seen.has(id)) await deleteMetaRow(id);
  }

  summaries.sort((a, b) => (b.lastReadAt ?? 0) - (a.lastReadAt ?? 0));
  return summaries;
}

/** All book ids in the library store. Keys are small — no blob reads. */
function listKeys(db: IDBDatabase): Promise<IDBValidKey[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAllKeys();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.onabort = () => reject(tx.error ?? new Error('listKeys aborted'));
  });
}

/**
 * Read one record on the given connection. Rejects with the request's error —
 * callers classify it (`isUnreadableRecordError`) and keep the failure local to
 * that record.
 */
function readRecord(db: IDBDatabase, key: IDBValidKey): Promise<StoredEpub | null> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve((req.result as StoredEpub | undefined) ?? null);
    req.onerror = () => reject(req.error);
    tx.onabort = () => reject(tx.error ?? req.error ?? new Error('read aborted'));
  });
}

/**
 * Migrate the pre-v3 single-book record (`key === 'current'`) to a per-book
 * handle. Returns its summary, or an `unavailable` tombstone when the record
 * cannot be read; never throws.
 */
async function migrateLegacyEpub(db: IDBDatabase, key: string): Promise<EpubSummary | null> {
  let value: StoredEpub | undefined;
  try {
    value = (await readRecord(db, key)) ?? undefined;
  } catch (err) {
    epubStorageErr(`legacy book record could not be read — marking it unavailable: ${errText(err)}`);
    return unavailableSummary(key, err);
  }
  if (!value?.data) return null;
  try {
    const id = await sha256Hex(value.data);
    const old = value.meta ?? ({} as Partial<EpubMeta>);
    await saveEpub(id, value.data, {
      ...old,
      id,
      fileName: old.fileName ?? 'book.epub',
      coverUrl: old.coverUrl ?? null,
      lastLocation: old.lastLocation ?? null,
      locationFormatVersion: old.locationFormatVersion ?? 1,
      lastAnchorOffset: old.lastAnchorOffset ?? 0,
      totalChars: old.totalChars ?? 0,
      readChars: old.readChars ?? 0,
      lastReadAt: old.lastReadAt ?? Date.now(),
      addedAt: old.addedAt ?? Date.now(),
    });
    await deleteEpub(key);
    const stored = await loadEpub(id);
    return stored ? normalizeSummary(stored.meta) : null;
  } catch (err) {
    epubStorageErr(`legacy book record could not be migrated: ${errText(err)}`);
    return null;
  }
}

/** Update metadata without rewriting the binary blob. */
export async function updateEpubMeta(id: string, meta: Partial<EpubMeta>): Promise<void> {
  if (!id) return;
  const db = await openDB();
  const captured: { meta: EpubMeta | null } = { meta: null };
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const existing = getReq.result as StoredEpub | undefined;
        if (!existing) { resolve(); return; }
        captured.meta = { ...existing.meta, ...meta };
        store.put({ ...existing, meta: captured.meta }, id);
      };
      // A record whose blob is unreadable keeps its (mirrored) metadata only:
      // the progress patch is applied to the mirror row instead of failing.
      getReq.onerror = () => { resolve(); };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
  const base = captured.meta ?? (await readAllMeta()).get(id);
  if (base) await writeMetaRow({ ...base, ...meta, id });
}

/** Delete a stored EPUB by id. */
export async function deleteEpub(id: string): Promise<void> {
  const db = await openDB();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
  await deleteMetaRow(id);
}

/** Store the whole-book search index keyed by book id. */
export async function saveBookIndex(id: string, spine: SpineIndexRecord[]): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(INDEX_STORE_NAME, 'readwrite');
    tx.objectStore(INDEX_STORE_NAME).put({ v: SEARCH_INDEX_VERSION, spine }, id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

/** Load a book's whole-book search index, or null if not indexed yet. */
export async function loadBookIndex(id: string): Promise<SpineIndexRecord[] | null> {
  const db = await openDB();
  try {
    return await new Promise<SpineIndexRecord[] | null>((resolve, reject) => {
      const tx = db.transaction(INDEX_STORE_NAME, 'readonly');
      const req = tx.objectStore(INDEX_STORE_NAME).get(id);
      req.onsuccess = () => {
        const rec = req.result as { v?: number; spine?: SpineIndexRecord[] } | null;
        if (!rec || rec.v !== SEARCH_INDEX_VERSION || !rec.spine?.length) {
          resolve(null);
          return;
        }
        resolve(rec.spine);
      };
      req.onerror = () => reject(req.error);
      tx.onabort = () => reject(tx.error ?? req.error ?? new Error('index read aborted'));
    });
  } catch (err) {
    // The index is a cache: an unreadable row is dropped so the next search
    // rebuilds it, instead of failing the search that asked for it.
    epubStorageErr(`book search index for ${id} could not be read — rebuilding it: ${errText(err)}`);
    await deleteBookIndex(id).catch(() => {});
    return null;
  } finally {
    db.close();
  }
}

/** Remove a book's search index. */
export async function deleteBookIndex(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(INDEX_STORE_NAME, 'readwrite');
    tx.objectStore(INDEX_STORE_NAME).delete(id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
