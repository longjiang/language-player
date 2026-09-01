/**
 * Multi-book EPUB storage (SPEC-049 §9.2/9.3).
 *
 * Every imported book gets a stable handle in AsyncStorage (metadata only)
 * plus its EPUB file + extracted cover in `documentDirectory/epub_library/`.
 * Reading progress (lastLocation, readChars/totalChars) is persisted per book
 * so the bookshelf can show progress and resume without reopening the zip.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import type { BookLocation } from '@/lib/epub-book';

export interface EpubMeta {
  /** Stable id derived from the file name (re-import updates the handle). */
  id: string;
  /** Content digest (md5 of the stored file bytes, base64-encoded) used to
   *  dedupe imports so a renamed copy never creates a duplicate shelf handle
   *  (SPEC-065 "bookId"); absent on legacy/pre-hash imports. */
  bookId?: string;
  fileName: string;
  fileSize: number;
  /** L2 the book was uploaded under (normalized primary subtag), or null
   *  for legacy books imported before per-L2 tagging. */
  language: string | null;
  /** Persisted file:// URI of the extracted cover (bookshelf thumbnails). */
  coverUrl: string | null;
  title: string;
  author: string;
  /** Last reading position in the whole-book block stream. */
  lastLocation: BookLocation | null;
  /** Total plain-text characters in the book. */
  totalChars: number;
  /** Characters read so far (prefix of blocks + offset). */
  readChars: number;
  /** Unix ms of the last time the book was opened/read. */
  lastReadAt: number;
  /** Unix ms when the book was first added. */
  addedAt: number;
}

/** Bookshelf view — metadata only. */
export type EpubSummary = EpubMeta;

const STORAGE_KEY = 'lp_epub_library_v1';

/**
 * Explicit "the reader was closed" flag (user request: a book closed by the
 * reader's close button must STAY closed across tab navigation and app
 * relaunch — no auto-open on return). Keyed per L2 primary subtag because the
 * bookshelf itself is per-L2. Cleared whenever a book is opened again, so the
 * normal resume behavior returns.
 */
const READER_CLOSED_KEY = 'lp_epub_reader_closed_v1';

/** Mark the reader as closed for this L2 (persists across app relaunch). */
export async function setReaderClosed(l2Code: string): Promise<void> {
  try {
    await AsyncStorage.setItem(READER_CLOSED_KEY, JSON.stringify({ l2: l2Code }));
  } catch { /* non-critical */ }
}

/** Clear the closed flag for this L2 (called when a book is opened). */
export async function clearReaderClosed(l2Code: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(READER_CLOSED_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { l2?: string };
    if (parsed?.l2 === l2Code) await AsyncStorage.removeItem(READER_CLOSED_KEY);
  } catch { /* non-critical */ }
}

/** Whether the reader was explicitly closed for this L2 (latches the
 *  bookshelf against the mount-time auto-open). */
export async function isReaderClosed(l2Code: string): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(READER_CLOSED_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { l2?: string };
    return parsed?.l2 === l2Code;
  } catch {
    return false;
  }
}

/** Directory holding imported EPUB files + extracted covers. */
export const LIBRARY_DIR = FileSystem.documentDirectory + 'epub_library/';

/** Legacy single-book state (pre-bookshelf useEpub) — migrated once. */
export const LEGACY_STATE_PATH = FileSystem.documentDirectory + 'epub_state.json';

export function libraryFileUri(id: string): string {
  return LIBRARY_DIR + id;
}

export async function ensureLibraryDir(): Promise<void> {
  try {
    await FileSystem.makeDirectoryAsync(LIBRARY_DIR, { intermediates: true });
  } catch {
    // Already exists.
  }
}

/** Older builds persisted covers with a doubled scheme (`file://file://…`)
 *  because documentDirectory/cacheDirectory already include `file://`.
 *  Normalize on every read so existing books show their covers without
 *  re-importing (and any later save persists the corrected value). */
function normalizeCoverUrl(coverUrl: string | null): string | null {
  if (coverUrl && coverUrl.startsWith('file://file://')) {
    return coverUrl.slice('file://'.length);
  }
  return coverUrl;
}

async function readAll(): Promise<EpubMeta[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return (Array.isArray(arr) ? arr : []).map((b) => ({
      ...b,
      coverUrl: normalizeCoverUrl(b?.coverUrl ?? null),
    }));
  } catch {
    return [];
  }
}

async function writeAll(items: EpubMeta[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

/**
 * Upsert a book, merging with any existing record so progress survives
 * re-uploads of the same file.
 */
export async function saveEpub(meta: EpubMeta, merge = true): Promise<void> {
  const items = await readAll();
  const idx = items.findIndex((b) => b.id === meta.id);
  if (idx === -1) {
    items.unshift(meta);
  } else {
    const existing = items[idx]!;
    const updated = merge
      ? {
          ...existing,
          ...meta,
          // Progress fields survive re-import unless the caller explicitly
          // overwrites them (meta values win when provided non-null).
          lastLocation: meta.lastLocation ?? existing.lastLocation,
          readChars: meta.readChars || existing.readChars,
          totalChars: meta.totalChars || existing.totalChars,
          addedAt: existing.addedAt,
        }
      : meta;
    items.splice(idx, 1);
    items.unshift(updated);
  }
  await writeAll(items);
}

/** Update metadata fields without touching the rest. */
export async function updateEpubMeta(id: string, patch: Partial<EpubMeta>): Promise<void> {
  const items = await readAll();
  const idx = items.findIndex((b) => b.id === id);
  if (idx === -1) return;
  items[idx] = { ...items[idx]!, ...patch };
  await writeAll(items);
}

/** List all stored books (metadata only), sorted by last read (newest first). */
export async function listEpubs(): Promise<EpubSummary[]> {
  const items = await readAll();
  items.sort((a, b) => (b.lastReadAt ?? 0) - (a.lastReadAt ?? 0));
  return items;
}

/** Delete a book's metadata + library files. */
export async function deleteEpub(meta: EpubMeta): Promise<void> {
  const items = await readAll();
  const next = items.filter((b) => b.id !== meta.id);
  if (next.length !== items.length) await writeAll(next);
  await deleteEpubFiles(meta);
}

/** Remove the library file and cover (best effort). */
export async function deleteEpubFiles(meta: EpubMeta): Promise<void> {
  try { await FileSystem.deleteAsync(libraryFileUri(meta.id)); } catch { /* already gone */ }
  if (meta.coverUrl?.startsWith('file://')) {
    // coverUrl is a full file:// URI — pass it through as-is (slice(7) would
    // strip the scheme and make the delete target a bare path).
    try { await FileSystem.deleteAsync(meta.coverUrl); } catch { /* already gone */ }
  }
}

/** Legacy single-book state shape (pre-bookshelf reader). */
export interface LegacyEpubState {
  fileName: string;
  fileUri: string;
  chapterHref: string | null;
  lastAnchor: string | null;
}

/** Read the legacy single-book state if its file still exists (no clear). */
export async function readLegacyState(): Promise<LegacyEpubState | null> {
  try {
    const info = await FileSystem.getInfoAsync(LEGACY_STATE_PATH);
    if (!info.exists) return null;
    const raw = await FileSystem.readAsStringAsync(LEGACY_STATE_PATH);
    const st: LegacyEpubState = JSON.parse(raw);
    const fileInfo = await FileSystem.getInfoAsync(st.fileUri);
    if (!fileInfo.exists) return null;
    return st;
  } catch {
    return null;
  }
}

/** Delete the legacy single-book state file. */
export async function clearLegacyState(): Promise<void> {
  try { await FileSystem.deleteAsync(LEGACY_STATE_PATH); } catch { /* already gone */ }
}
