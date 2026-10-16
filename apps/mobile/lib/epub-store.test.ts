import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * The mobile EPUB library metadata must never be mistaken for "empty".
 *
 * `readAll()` used to return `[]` on ANY storage failure, so a transient
 * AsyncStorage read failure showed an empty shelf — and the next write then
 * persisted that empty list, wiping every stored book. These tests pin the two
 * properties that matter: a failed read is reported, and no writer overwrites a
 * list it could not read.
 */

const store = new Map<string, string>();
/** When set, `AsyncStorage.getItem` rejects (a transient storage failure). */
let readFailure: Error | null = null;
let setItemCalls: Array<{ key: string; value: string }> = [];

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (key: string) => {
      if (readFailure) throw readFailure;
      return store.get(key) ?? null;
    },
    setItem: async (key: string, value: string) => {
      setItemCalls.push({ key, value });
      store.set(key, value);
    },
    removeItem: async (key: string) => {
      store.delete(key);
    },
  },
}));

vi.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///documents/',
  cacheDirectory: 'file:///cache/',
  getInfoAsync: async () => ({ exists: true, size: 1024 }),
  deleteAsync: async () => {},
  makeDirectoryAsync: async () => {},
  readAsStringAsync: async () => '',
  writeAsStringAsync: async () => {},
  copyAsync: async () => {},
}));

vi.mock('@/lib/logger', () => ({
  log: () => {},
  logwarn: () => {},
  logerr: () => {},
}));

import {
  EpubLibraryUnreadableError,
  deleteEpub,
  listEpubs,
  saveEpub,
  updateEpubMeta,
  type EpubMeta,
} from './epub-store';

const STORAGE_KEY = 'lp_epub_library_v1';

function book(id: string, overrides: Partial<EpubMeta> = {}): EpubMeta {
  return {
    id,
    fileName: `${id}.epub`,
    fileSize: 2048,
    language: 'ja',
    coverUrl: null,
    title: '',
    author: '',
    lastLocation: null,
    totalChars: 100,
    readChars: 10,
    lastReadAt: 1000,
    addedAt: 1000,
    ...overrides,
  };
}

const storedList = (): unknown => JSON.parse(store.get(STORAGE_KEY) ?? '[]');

beforeEach(() => {
  store.clear();
  setItemCalls = [];
  readFailure = null;
});

describe('mobile EPUB library metadata', () => {
  it('round-trips a saved book', async () => {
    await saveEpub(book('b1'));
    const list = await listEpubs();
    expect(list.map((b) => b.fileName)).toEqual(['b1.epub']);
  });

  it('reports a failed read instead of pretending the library is empty', async () => {
    await saveEpub(book('b1'));
    await saveEpub(book('b2'));
    readFailure = new Error('AsyncStorage is unavailable');

    const err = await listEpubs().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EpubLibraryUnreadableError);
    expect((err as Error).name).toBe('EpubLibraryUnreadableError');
  });

  it('never overwrites the library when the read failed (the data-loss regression)', async () => {
    await saveEpub(book('b1'));
    await saveEpub(book('b2'));
    const before = store.get(STORAGE_KEY);
    readFailure = new Error('AsyncStorage is unavailable');
    setItemCalls = [];

    await expect(saveEpub(book('b9'))).rejects.toBeInstanceOf(EpubLibraryUnreadableError);
    await expect(updateEpubMeta('b1', { readChars: 99 })).rejects.toBeInstanceOf(EpubLibraryUnreadableError);
    await expect(deleteEpub(book('b1'))).rejects.toBeInstanceOf(EpubLibraryUnreadableError);

    // Nothing was written at all. Before this change the failed read returned
    // `[]`, so `saveEpub`/`deleteEpub` persisted that empty list and wiped both
    // books.
    expect(setItemCalls).toEqual([]);
    expect(store.get(STORAGE_KEY)).toBe(before);

    // Both books survive (b1 was not deleted) once storage recovers.
    readFailure = null;
    expect((await listEpubs()).map((b) => b.id).sort()).toEqual(['b1', 'b2']);
    expect(storedList()).toHaveLength(2);
  });

  it('starts empty (without throwing) when the stored metadata is corrupt', async () => {
    store.set(STORAGE_KEY, '{not json');
    await expect(listEpubs()).resolves.toEqual([]);
    // A later save replaces the unusable value rather than failing forever.
    await saveEpub(book('b1'));
    expect((await listEpubs()).map((b) => b.id)).toEqual(['b1']);
  });

  it('merges progress into an existing book instead of duplicating it', async () => {
    await saveEpub(book('b1', { totalChars: 100 }));
    await updateEpubMeta('b1', { readChars: 42 });
    const list = await listEpubs();
    expect(list).toHaveLength(1);
    expect(list[0]!.readChars).toBe(42);
  });

  it('drops a book and keeps the rest on delete', async () => {
    await saveEpub(book('b1'));
    await saveEpub(book('b2'));
    await deleteEpub(book('b1'));
    expect((await listEpubs()).map((b) => b.id)).toEqual(['b2']);
  });
});
