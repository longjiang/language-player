/**
 * EPUB store resilience tests (the "file is no longer readable" regression).
 *
 * A book's binary is a LARGE IndexedDB value, which Chromium keeps in a
 * separate file on disk. Disk-cleanup tools delete those files while the
 * LevelDB reference survives, so `get()` fails with a DOMException named
 * `NotReadableError` ("Data lost due to missing file…irrecoverable") — and the
 * transaction aborts. Before this fix, that rejection propagated out of
 * `listEpubs()` and left the reader on a spinner forever.
 *
 * These tests drive the real store module against a small fake IndexedDB (no
 * new dependency) that can make one specific record's `get` fail the way
 * Chromium's does — request error + transaction abort.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  deleteEpub,
  isUnreadableRecordError,
  listEpubs,
  loadBookIndex,
  loadEpub,
  saveBookIndex,
  saveEpub,
  updateEpubMeta,
  type EpubMeta,
} from './epub-store';

// ── Minimal fake IndexedDB ────────────────────────────────────────────────
// Implements only what epub-store.ts uses: open (with onupgradeneeded),
// object stores, get/put/delete/getAllKeys/openCursor, and the transaction
// lifecycle (oncomplete/onerror/onabort, abort on an unhandled request error).

type FailMode = 'unreadable' | 'notreadable-legacy' | 'generic';
interface InjectedFailure {
  db: string;
  store: string;
  key: string;
  mode: FailMode;
  /** Consume the failure after the first matching read (models a record that
   *  gets repaired by the next successful write). */
  once?: boolean;
}

let failures: InjectedFailure[] = [];
let getCalls: Array<{ db: string; store: string; key: string }> = [];

function errorFor(mode: FailMode): Error {
  if (mode === 'unreadable') {
    const err = new Error(
      'Data lost due to missing file. Affected record should be considered irrecoverable',
    );
    err.name = 'NotReadableError';
    return err;
  }
  if (mode === 'notreadable-legacy') {
    // Chrome 130/131 reported the same condition as NotFoundError.
    const err = new Error('Failed to read large IndexedDB value');
    err.name = 'NotFoundError';
    return err;
  }
  const err = new Error('Failed to read large IndexedDB value');
  err.name = 'UnknownError';
  return err;
}

class FakeRequest {
  result: unknown = undefined;
  error: unknown = null;
  onsuccess: (() => void) | null = null;
  onerror: (() => void) | null = null;
}

interface FakeOpenRequest extends FakeRequest {
  onupgradeneeded: (() => void) | null;
  onblocked: (() => void) | null;
}

class FakeTransaction {
  oncomplete: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  error: unknown = null;
  aborted = false;
  private ops: Array<() => void> = [];
  private drainScheduled = false;

  constructor(readonly db: FakeDb, readonly storeName: string, readonly mode: string) {}

  objectStore(name?: string): FakeStore {
    return new FakeStore(this, name ?? this.storeName);
  }

  queue(op: () => void): void {
    this.ops.push(op);
    if (this.drainScheduled) return;
    this.drainScheduled = true;
    queueMicrotask(() => {
      this.drainScheduled = false;
      while (this.ops.length) {
        this.ops.shift()!();
        if (this.aborted) return; // real IndexedDB discards the pending work
      }
      this.oncomplete?.();
    });
  }

  abortWith(error: unknown): void {
    if (this.aborted) return;
    this.aborted = true;
    this.error = error;
    queueMicrotask(() => this.onabort?.());
  }
}

class FakeStore {
  constructor(private tx: FakeTransaction, private name: string) {}

  private map(): Map<string, unknown> {
    let m = this.tx.db.data.get(this.name);
    if (!m) {
      m = new Map();
      this.tx.db.data.set(this.name, m);
    }
    return m;
  }

  get(key: unknown): FakeRequest {
    const req = new FakeRequest();
    const k = String(key);
    this.tx.queue(() => {
      getCalls.push({ db: this.tx.db.name, store: this.name, key: k });
      const idx = failures.findIndex(
        (f) => f.db === this.tx.db.name && f.store === this.name && f.key === k,
      );
      const failure = idx === -1 ? undefined : failures[idx]!;
      if (failure) {
        if (failure.once) failures.splice(idx, 1);
        req.error = errorFor(failure.mode);
        req.onerror?.();
        this.tx.abortWith(req.error);
        return;
      }
      req.result = this.map().get(k);
      req.onsuccess?.();
    });
    return req;
  }

  put(value: unknown, key: unknown): FakeRequest {
    const map = this.map();
    this.tx.queue(() => {
      map.set(String(key), typeof structuredClone === 'function' ? structuredClone(value) : value);
    });
    return new FakeRequest();
  }

  delete(key: unknown): FakeRequest {
    const map = this.map();
    this.tx.queue(() => {
      map.delete(String(key));
    });
    return new FakeRequest();
  }

  getAllKeys(): FakeRequest {
    const req = new FakeRequest();
    this.tx.queue(() => {
      req.result = [...this.map().keys()];
      req.onsuccess?.();
    });
    return req;
  }

  openCursor(): FakeRequest {
    const req = new FakeRequest();
    const map = this.map();
    this.tx.queue(() => {
      const keys = [...map.keys()];
      let i = 0;
      const step = () => {
        if (i >= keys.length) {
          req.result = null;
          req.onsuccess?.();
          return;
        }
        const key = keys[i++]!;
        req.result = { key, value: map.get(key), continue: () => this.tx.queue(step) };
        req.onsuccess?.();
      };
      step();
    });
    return req;
  }
}

class FakeDb {
  data = new Map<string, Map<string, unknown>>();
  onversionchange: (() => void) | null = null;
  objectStoreNames = {
    contains: (name: string) => this.data.has(name),
  };

  constructor(readonly name: string) {}

  createObjectStore(name: string): void {
    if (!this.data.has(name)) this.data.set(name, new Map());
  }

  transaction(name: string): FakeTransaction {
    if (!this.data.has(name)) throw new Error(`no such object store: ${name}`);
    return new FakeTransaction(this, name, 'readwrite');
  }

  close(): void {}
}

const databases = new Map<string, FakeDb>();
let fakeIndexedDb: { open: (name: string, version: number) => FakeOpenRequest };

function makeOpenRequest(): FakeOpenRequest {
  const req = new FakeRequest() as FakeOpenRequest;
  req.onupgradeneeded = null;
  req.onblocked = null;
  return req;
}

function installFakeIndexedDb(): void {
  databases.clear();
  fakeIndexedDb = {
    open(name: string): FakeOpenRequest {
      const req = makeOpenRequest();
      queueMicrotask(() => {
        let db = databases.get(name);
        const fresh = !db;
        if (!db) {
          db = new FakeDb(name);
          databases.set(name, db);
        }
        // The real `onupgradeneeded` fires when the store layout is missing.
        if (fresh || !db.objectStoreNames.contains('epubs')) {
          req.result = db;
          req.onupgradeneeded?.();
        }
        req.result = db;
        req.onsuccess?.();
      });
      return req;
    },
  };
  (globalThis as { indexedDB?: unknown }).indexedDB = fakeIndexedDb;
}

const STORE_DB = 'lp-epub-store';
const META_DB = 'lp-epub-meta';
const INDEX_STORE = 'book-index';

function metaRow(overrides: Partial<EpubMeta> & { id: string }): EpubMeta {
  return {
    fileName: `${overrides.id}.epub`,
    fileSize: 1024,
    format: 'epub',
    language: 'ja',
    coverUrl: null,
    lastLocation: null,
    locationFormatVersion: 1,
    lastChapterHref: null,
    lastChapterTitle: null,
    lastAnchor: null,
    lastAnchorOffset: 0,
    totalChars: 100,
    readChars: 10,
    lastReadAt: 1000,
    addedAt: 1000,
    ...overrides,
  };
}

/** Seed a pre-mirror record directly (as a pre-fix install would have left it). */
function seedRecordWithoutMirror(id: string, meta: EpubMeta): void {
  const db = new FakeDb(STORE_DB);
  db.createObjectStore('epubs');
  db.createObjectStore(INDEX_STORE);
  databases.set(STORE_DB, db);
  db.data.get('epubs')!.set(id, { id, data: new ArrayBuffer(8), meta });
}

function forgetMirrorRow(id: string): void {
  databases.get(META_DB)!.data.get('epub-meta')!.delete(id);
}

beforeEach(() => {
  failures = [];
  getCalls = [];
  installFakeIndexedDb();
});

afterEach(() => {
  delete (globalThis as { indexedDB?: unknown }).indexedDB;
});

describe('isUnreadableRecordError', () => {
  it('classifies Chrome 132+ NotReadableError as irrecoverable', () => {
    expect(isUnreadableRecordError(errorFor('unreadable'))).toBe(true);
  });

  it('classifies the Chrome 130/131 NotFoundError equivalent as irrecoverable', () => {
    expect(isUnreadableRecordError(errorFor('notreadable-legacy'))).toBe(true);
  });

  it('does not treat a transient read failure as lost data', () => {
    expect(isUnreadableRecordError(errorFor('generic'))).toBe(false);
    expect(isUnreadableRecordError(null)).toBe(false);
    expect(isUnreadableRecordError(new Error('boom'))).toBe(false);
  });
});

describe('listEpubs with an unreadable record', () => {
  it('resolves and isolates the failure to the one book', async () => {
    await saveEpub('ok-1', new ArrayBuffer(8), { id: 'ok-1', fileName: 'good.epub' });
    await saveEpub('dead-1', new ArrayBuffer(8), { id: 'dead-1', fileName: 'gone.epub' });
    forgetMirrorRow('dead-1');
    failures.push({ db: STORE_DB, store: 'epubs', key: 'dead-1', mode: 'unreadable' });

    const books = await listEpubs();

    expect(books.map((b) => b.id).sort()).toEqual(['dead-1', 'ok-1']);
    expect(books.find((b) => b.id === 'dead-1')!.unavailable).toBe('unreadable');
    const ok = books.find((b) => b.id === 'ok-1')!;
    expect(ok.fileName).toBe('good.epub');
    expect(ok.unavailable).toBeUndefined();
  });

  it('does not read the binary record when the metadata mirror has the book', async () => {
    await saveEpub('ok-1', new ArrayBuffer(8), { id: 'ok-1', fileName: 'good.epub' });
    await saveEpub('dead-1', new ArrayBuffer(8), { id: 'dead-1', fileName: 'gone.epub' });
    failures.push({ db: STORE_DB, store: 'epubs', key: 'dead-1', mode: 'unreadable' });
    getCalls = [];

    const books = await listEpubs();

    // The mirrored metadata survived, so the card keeps its real name…
    const dead = books.find((b) => b.id === 'dead-1')!;
    expect(dead.fileName).toBe('gone.epub');
    expect(dead.unavailable).toBeUndefined();
    // …and no book blob was read at all.
    expect(getCalls.filter((c) => c.db === STORE_DB && c.store === 'epubs')).toHaveLength(0);
  });

  it('backfills the mirror from a pre-mirror record', async () => {
    seedRecordWithoutMirror('legacy-1', metaRow({ id: 'legacy-1', fileName: 'old.epub' }));

    const first = await listEpubs();
    expect(first.map((b) => b.fileName)).toEqual(['old.epub']);
    expect(databases.get(META_DB)!.data.get('epub-meta')!.has('legacy-1')).toBe(true);

    // A second load is served entirely from the mirror.
    getCalls = [];
    const second = await listEpubs();
    expect(second[0]!.fileName).toBe('old.epub');
    expect(getCalls.filter((c) => c.store === 'epubs')).toHaveLength(0);
  });

  it('marks a record whose read fails generically as unavailable but retryable', async () => {
    await saveEpub('flaky-1', new ArrayBuffer(8), { id: 'flaky-1', fileName: 'flaky.epub' });
    forgetMirrorRow('flaky-1');
    failures.push({ db: STORE_DB, store: 'epubs', key: 'flaky-1', mode: 'generic' });

    const books = await listEpubs();
    expect(books[0]!.unavailable).toBe('error');
    expect(books[0]!.fileName).toBe('');
  });

  it('still lists the shelf from the mirror when the library DB cannot be opened', async () => {
    await saveEpub('ok-1', new ArrayBuffer(8), { id: 'ok-1', fileName: 'good.epub' });

    const realOpen = fakeIndexedDb.open;
    fakeIndexedDb.open = (name: string, version: number) => {
      if (name !== STORE_DB) return realOpen(name, version);
      // Another tab holds an older version open → `blocked`, never `success`.
      const req = makeOpenRequest();
      queueMicrotask(() => req.onblocked?.());
      return req;
    };

    const books = await listEpubs();
    expect(books.map((b) => b.fileName)).toEqual(['good.epub']);
  });
});

describe('mirror upkeep', () => {
  it('keeps progress in the mirror across an update', async () => {
    await saveEpub('b1', new ArrayBuffer(8), { id: 'b1', fileName: 'b.epub' });
    await updateEpubMeta('b1', {
      readChars: 42,
      lastLocation: { spineIndex: 0, blockIndex: 2, offset: 3 },
    });

    const row = databases.get(META_DB)!.data.get('epub-meta')!.get('b1') as EpubMeta;
    expect(row.readChars).toBe(42);
    expect(row.lastLocation).toEqual({ spineIndex: 0, blockIndex: 2, offset: 3 });
  });

  it('removes both the record and its mirror row on delete', async () => {
    await saveEpub('b1', new ArrayBuffer(8), { id: 'b1', fileName: 'b.epub' });
    await deleteEpub('b1');

    expect(databases.get(STORE_DB)!.data.get('epubs')!.has('b1')).toBe(false);
    expect(databases.get(META_DB)!.data.get('epub-meta')!.has('b1')).toBe(false);
    expect(await listEpubs()).toEqual([]);
  });

  it('prunes mirror rows whose record is gone', async () => {
    await saveEpub('b1', new ArrayBuffer(8), { id: 'b1', fileName: 'b.epub' });
    databases.get(STORE_DB)!.data.get('epubs')!.delete('b1');

    expect(await listEpubs()).toEqual([]);
    expect(databases.get(META_DB)!.data.get('epub-meta')!.has('b1')).toBe(false);
  });
});

describe('saveEpub with an unreadable existing record', () => {
  it('replaces the record instead of failing the import', async () => {
    await saveEpub('b1', new ArrayBuffer(8), { id: 'b1', fileName: 'b.epub' });
    forgetMirrorRow('b1');
    // The existing record cannot be read while saving its replacement; the
    // retry writes fresh bytes, which are readable again afterwards.
    failures.push({ db: STORE_DB, store: 'epubs', key: 'b1', mode: 'unreadable', once: true });

    await expect(
      saveEpub('b1', new ArrayBuffer(16), { id: 'b1', fileName: 'b2.epub' }),
    ).resolves.toBeUndefined();

    const stored = await loadEpub('b1');
    expect(stored?.meta.fileName).toBe('b2.epub');
    expect(stored?.data.byteLength).toBe(16);
  });
});

describe('loadEpub', () => {
  it('rejects with the irrecoverable error so the caller can classify it', async () => {
    failures.push({ db: STORE_DB, store: 'epubs', key: 'dead', mode: 'unreadable' });

    const err = await loadEpub('dead').catch((e: unknown) => e);
    expect((err as Error).name).toBe('NotReadableError');
    expect(isUnreadableRecordError(err)).toBe(true);
  });
});

describe('loadBookIndex', () => {
  it('drops an unreadable index row and reports "not indexed" so it is rebuilt', async () => {
    await saveEpub('b1', new ArrayBuffer(8), { id: 'b1', fileName: 'b.epub' });
    await saveBookIndex('b1', [{ spineIndex: 0, text: 'hello', starts: [0] }]);
    failures.push({ db: STORE_DB, store: INDEX_STORE, key: 'b1', mode: 'unreadable' });

    expect(await loadBookIndex('b1')).toBeNull();
    failures = [];
    expect(await loadBookIndex('b1')).toBeNull(); // the bad row was dropped
  });
});
