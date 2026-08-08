/**
 * Offline dictionary storage layer using expo-sqlite.
 *
 * Stores downloaded dictionary entries and LLM-generated cache entries
 * for offline word lookup. Uses a separate SQLite database file
 * (`dictionary.db`) from the main app database.
 *
 * Schema:
 *   dict_{l2}    — one table per downloaded language, stores full
 *                  DictionaryEntry as JSON with indexed head and alternate
 *                  columns (alternate = traditional script for zh/yue)
 *   llm_cache     — shared table for LLM-generated entries
 *   dict_meta     — per-language download metadata
 */

import * as SQLite from 'expo-sqlite';
import { Directory, File, Paths } from 'expo-file-system';
import type { DictionaryEntry, DictMeta } from '@langplayer/shared';
import { log, logwarn } from '@/lib/logger';

// ── Constants ────────────────────────────────

const DB_NAME = 'dictionary.db';
const CHUNK_SIZE = 500;

/** Per-language precompiled dictionary files live in Documents/dictionaries. */
const DICTIONARIES_DIR_URI = `${Paths.document.uri}dictionaries`;
const DICTIONARIES_DIR_PATH = DICTIONARIES_DIR_URI.replace(/^file:\/\//, '');

const l2DbCache = new Map<string, SQLite.SQLiteDatabase>();

/** Escape a string for safe inclusion in a SQL string literal. */
function esc(s: string): string {
  return s.replace(/'/g, "''");
}

/** Escape a string or return NULL. */
function escOrNull(s: string | null): string {
  if (s === null || s === undefined) return 'NULL';
  return `'${esc(s)}'`;
}

// ── Singleton ─────────────────────────────────

let _db: SQLite.SQLiteDatabase | null = null;
let _dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/**
 * Open (or reuse) the dictionary SQLite database.
 * Idempotent — safe to call multiple times.
 */
export async function openDictionaryDB(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  if (_dbPromise) return _dbPromise;

  _dbPromise = (async () => {
    _db = await SQLite.openDatabaseAsync(DB_NAME);

    // Enable WAL mode for better concurrent read/write performance
    await _db.execAsync('PRAGMA journal_mode=WAL');
    await _db.execAsync('PRAGMA synchronous=NORMAL');
    // Larger page cache for bulk downloads and lookups (~8 MB).
    await _db.execAsync('PRAGMA cache_size=-8192');

    // ── Shared tables (created once) ──
    await _db.execAsync(`
      CREATE TABLE IF NOT EXISTS llm_cache (
        text TEXT NOT NULL,
        l1 TEXT NOT NULL,
        l2 TEXT NOT NULL,
        entry_json TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        PRIMARY KEY (text, l1, l2)
      );

      CREATE TABLE IF NOT EXISTS dict_meta (
        l2 TEXT PRIMARY KEY,
        downloaded_at TEXT NOT NULL,
        entry_count INTEGER NOT NULL,
        size_bytes INTEGER,
        version TEXT
      );
    `);

    // ── Clean up orphaned dict tables from crashed downloads ──
    await _cleanupOrphanedDicts(_db);

    // ── Backfill alternate script column on pre-existing downloads ──
    await migrateDictTables(_db);

    // Reclaim free pages left by previous download/delete cycles. This is a
    // cheap PRAGMA check on normal opens and only VACUUMs when there is
    // meaningful free space to reclaim.
    await shrinkDictionaryDB(_db);

    return _db;
  })();

  return _dbPromise;
}

/**
 * Drop any dict_{l2} tables that have no corresponding dict_meta entry.
 * These are left behind when the app crashes or reloads mid-download —
 * partial data that was never completed. Without cleanup, they waste
 * storage and cause hasOfflineDictionary to return false anyway
 * (since it checks dict_meta, not table existence).
 */
async function _cleanupOrphanedDicts(db: SQLite.SQLiteDatabase): Promise<void> {
  try {
    const tables = await db.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'dict_%' AND name != 'dict_meta'"
    );
    if (tables.length === 0) return;

    const metas = await db.getAllAsync<{ l2: string }>('SELECT l2 FROM dict_meta');
    const validL2s = new Set(metas.map((m) => m.l2));

    let droppedAny = false;
    for (const t of tables) {
      // Extract l2 from table name: dict_ja → ja, dict_zh_Hans → zh-Hans
      const l2 = t.name.slice(5).replace(/_/g, '-');
      if (!validL2s.has(l2)) {
        log('[DictDB] 🧹 cleaning up orphaned table:', t.name, '(no dict_meta entry — likely crashed mid-download)');
        await db.execAsync(`DROP TABLE IF EXISTS ${t.name}`);
        droppedAny = true;
      }
    }
    if (droppedAny) {
      await shrinkDictionaryDB(db);
    }
  } catch {
    // Best-effort cleanup
  }
}

/**
 * Reclaim free pages left behind by dropped dictionary tables.
 *
 * SQLite keeps dropped-table pages in the database file unless VACUUM (or
 * incremental vacuum) reclaims them. Repeated download → delete cycles
 * otherwise grow dictionary.db forever and slow down later re-downloads.
 */
async function shrinkDictionaryDB(db: SQLite.SQLiteDatabase): Promise<void> {
  try {
    const row = await db.getFirstAsync<{ freelist_count: number }>(
      'PRAGMA freelist_count'
    );
    if ((row?.freelist_count ?? 0) > 1024) {
      log('[DictDB] 🧹 VACUUM — reclaiming', row!.freelist_count, 'free pages');
      const start = Date.now();
      await db.execAsync('VACUUM');
      log('[DictDB] ✅ VACUUM done — took', Date.now() - start, 'ms');
    }
  } catch (e) {
    log('[DictDB] ⚠️ VACUUM failed:', e);
  }
}

/**
 * Close the dictionary database. Useful for cleanup or testing.
 */
export async function closeDictionaryDB(): Promise<void> {
  if (_db) {
    await _db.closeAsync();
    _db = null;
    _dbPromise = null;
  }
}

// ── Per-language precompiled dictionaries ─────────────────

/** Stable file name for a language's precompiled dictionary. */
export function dictionaryDbFileName(l2: string): string {
  return `dict_${l2.replace(/-/g, '_')}.db`;
}

/** File handle for a language's precompiled dictionary. */
export function dictionaryDbFile(l2: string): File {
  return new File(DICTIONARIES_DIR_URI, dictionaryDbFileName(l2));
}

async function ensureDictionariesDir(): Promise<void> {
  const dir = new Directory(DICTIONARIES_DIR_URI);
  dir.create({ intermediates: true, idempotent: true });
}

/**
 * Open a downloaded per-language dictionary DB, or null if it hasn't been
 * downloaded yet. Handles are cached per language for fast lookups.
 */
export async function openOfflineDictionaryDB(
  l2: string,
): Promise<SQLite.SQLiteDatabase | null> {
  const file = dictionaryDbFile(l2);
  if (!file.exists) return null;

  const cached = l2DbCache.get(l2);
  if (cached) return cached;

  await ensureDictionariesDir();
  log('[DictDB] opening precompiled dict file — l2:', l2, 'file:', dictionaryDbFileName(l2));
  const db = await SQLite.openDatabaseAsync(
    dictionaryDbFileName(l2),
    {},
    DICTIONARIES_DIR_PATH,
  );
  l2DbCache.set(l2, db);
  return db;
}

/** Close and drop the cached handle for one language (e.g. before delete). */
export async function closeOfflineDictionaryDB(l2: string): Promise<void> {
  const db = l2DbCache.get(l2);
  if (db) {
    try { await db.closeAsync(); } catch { /* already closed */ }
    l2DbCache.delete(l2);
  }
}

/**
 * Atomically replace a language's dictionary file. The gzipped payload has
 * already been decompressed by the caller; this writes to a temp file, then
 * moves it over the destination so a failed write never corrupts the
 * previously downloaded dictionary.
 */
export async function savePrecompiledDictionary(
  l2: string,
  dbBytes: Uint8Array,
): Promise<DictMeta> {
  await ensureDictionariesDir();
  await closeOfflineDictionaryDB(l2);

  const finalFile = dictionaryDbFile(l2);
  const tmpFile = new File(
    DICTIONARIES_DIR_URI,
    `${dictionaryDbFileName(l2)}.tmp`,
  );
  if (tmpFile.exists) tmpFile.delete();

  tmpFile.write(dbBytes);
  try {
    await tmpFile.move(finalFile, { overwrite: true });
    log('[DictDB] 💾 saved precompiled dict — l2:', l2, 'file:', dictionaryDbFileName(l2), 'bytes:', dbBytes.length);
  } catch (e) {
    try { tmpFile.delete(); } catch { /* best effort */ }
    throw e;
  }

  let db: SQLite.SQLiteDatabase | null = null;
  try {
    db = await openOfflineDictionaryDB(l2);
  } catch {
    await closeOfflineDictionaryDB(l2);
    try { finalFile.delete(); } catch { /* best effort */ }
    throw new Error('Precompiled dictionary could not be opened');
  }
  if (!db) {
    await closeOfflineDictionaryDB(l2);
    try { finalFile.delete(); } catch { /* best effort */ }
    throw new Error('Precompiled dictionary could not be opened');
  }

  try {
    const table = dictTableName(l2);
    const tableCheck = await db.getFirstAsync<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM ${table}`,
    );
    if (tableCheck === undefined) {
      throw new Error(`Precompiled dictionary is missing table ${table}`);
    }

    const meta = await db.getFirstAsync<DictMeta>(
      'SELECT l2, downloaded_at, entry_count, size_bytes, version FROM dict_meta WHERE l2 = ?',
      [l2],
    );
    if (!meta) {
      throw new Error('Precompiled dictionary is missing dict_meta');
    }
    meta.size_bytes = finalFile.size;
    return meta;
  } catch (e) {
    // Don't leave a corrupt file in place when validation fails.
    await closeOfflineDictionaryDB(l2);
    try { finalFile.delete(); } catch { /* best effort */ }
    throw e;
  }
}

/**
 * Read metadata embedded in a per-language DB file. Falls back to the central
 * dict_meta table for dictionaries downloaded with the old insert path.
 */
export async function getDictMetaForL2(l2: string): Promise<DictMeta | null> {
  let l2Db: SQLite.SQLiteDatabase | null = null;
  try {
    l2Db = await openOfflineDictionaryDB(l2);
  } catch {
    l2Db = null;
  }
  if (l2Db) {
    const fileMeta = await l2Db.getFirstAsync<DictMeta>(
      'SELECT l2, downloaded_at, entry_count, size_bytes, version FROM dict_meta WHERE l2 = ?',
      [l2],
    );
    if (fileMeta) return fileMeta;
  }
  const db = await openDictionaryDB();
  return getDictMeta(db, l2);
}

// ── Table helpers ─────────────────────────────

/**
 * Validate an L2 language code for use in a table name.
 * Allows lowercase alphanumeric codes with optional hyphens
 * (e.g., "ja", "zh-Hans", "fsl").
 */
function sanitizeL2(l2: string): string {
  if (/^[a-z][a-zA-Z0-9-]*$/.test(l2)) return l2;
  throw new Error(`Invalid L2 code: "${l2}". Expected lowercase alphanumeric code.`);
}

function dictTableName(l2: string): string {
  return `dict_${sanitizeL2(l2).replace(/-/g, '_')}`;
}

/**
 * Create the dict_{l2} table (if it doesn't exist). Lookup indexes are
 * created separately by createDictIndexes() so bulk downloads can defer
 * index maintenance until after all rows are inserted.
 */
async function ensureDictTable(db: SQLite.SQLiteDatabase, l2: string): Promise<void> {
  const table = dictTableName(l2);
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS ${table} (
      id TEXT PRIMARY KEY,
      head TEXT NOT NULL,
      alternate TEXT,
      pronunciation TEXT,
      entry_json TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
}

/**
 * Create the head/alternate lookup indexes. Kept separate from table creation
 * so a bulk download can insert without index-maintenance overhead, then
 * build both indexes once at the end.
 */
async function createDictIndexes(db: SQLite.SQLiteDatabase, l2: string): Promise<void> {
  const table = dictTableName(l2);
  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_${table}_head ON ${table}(head COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_${table}_alternate ON ${table}(alternate COLLATE NOCASE);
  `);
}

/**
 * One-time migration for dict tables downloaded before the alternate column
 * existed. Adds the column/index and backfills values from entry_json so
 * existing Chinese downloads segment and look up both simplified and
 * traditional text without forcing a re-download.
 *
 * Idempotent: already-migrated tables are skipped, and the backfill only
 * touches rows where alternate is still NULL, so a crash mid-migration just
 * resumes on the next app launch.
 */
async function migrateDictTables(db: SQLite.SQLiteDatabase): Promise<void> {
  try {
    const tables = await db.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'dict_%' AND name != 'dict_meta'"
    );

    for (const { name } of tables) {
      const cols = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${name})`);
      if (cols.some((c) => c.name === 'alternate')) continue;

      log('[DictDB] 🧬 migrating', name, '— adding alternate column');
      await db.execAsync(`ALTER TABLE ${name} ADD COLUMN alternate TEXT`);
      await db.execAsync(
        `CREATE INDEX IF NOT EXISTS idx_${name}_alternate ON ${name}(alternate COLLATE NOCASE)`
      );

      const rows = await db.getAllAsync<{ id: string; entry_json: string }>(
        `SELECT id, entry_json FROM ${name} WHERE alternate IS NULL`
      );
      for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
        const statements = rows.slice(i, i + CHUNK_SIZE).map((r) => {
          let alternate: string | null = null;
          try {
            alternate = (JSON.parse(r.entry_json) as DictionaryEntry).alternate ?? null;
          } catch {
            // Corrupt row — leave alternate NULL
          }
          return `UPDATE ${name} SET alternate=${escOrNull(alternate)} WHERE id='${esc(r.id)}';`;
        }).join('');
        if (statements) await db.execAsync(statements);
      }
      log('[DictDB] ✅ migrated', name, '— backfilled', rows.length, 'rows');
    }
  } catch (e) {
    log('[DictDB] ⚠️ dict table migration failed:', e);
  }
}

// ── Offline lookup ────────────────────────────

/**
 * Look up a word in the offline dictionary (exact match, case-insensitive).
 * Returns matching DictionaryEntry[] or null if not found.
 */
export async function lookupOffline(
  db: SQLite.SQLiteDatabase,
  text: string,
  l2: string,
): Promise<DictionaryEntry[] | null> {
  const table = dictTableName(l2);
  try {
    log('[DictDB] legacy central lookup — l2:', l2, 'text:', text, 'table:', table);
    // Primary: head match (simplified for zh). Mirrors the server's
    // `head = ? OR alternate = ?` lookup so traditional text resolves to
    // the same entry offline. Two indexed queries keep this fast.
    let rows = await db.getAllAsync<{ entry_json: string }>(
      `SELECT entry_json FROM ${table} WHERE head = ? COLLATE NOCASE`,
      [text],
    );
    log('[DictDB] legacy head rows — l2:', l2, 'text:', text, 'rows:', rows?.length ?? 0);
    if (!rows || rows.length === 0) {
      rows = await db.getAllAsync<{ entry_json: string }>(
        `SELECT entry_json FROM ${table} WHERE alternate = ? COLLATE NOCASE`,
        [text],
      );
      log('[DictDB] legacy alternate rows — l2:', l2, 'text:', text, 'rows:', rows?.length ?? 0);
    }
    if (!rows || rows.length === 0) return null;
    return rows.map((r) => JSON.parse(r.entry_json) as DictionaryEntry);
  } catch (e) {
    // Table doesn't exist yet (not downloaded for this language)
    logwarn('[DictDB] ❌ legacy central lookup failed — l2:', l2, 'text:', text, 'table:', table, 'error:', (e as Error)?.message ?? e);
    return null;
  }
}

/**
 * Look up a word in the per-language precompiled DB, falling back to the
 * legacy central dictionary.db table for dictionaries downloaded before
 * precompiled files existed.
 */
export async function lookupOfflineByL2(
  l2: string,
  text: string,
): Promise<DictionaryEntry[] | null> {
  let l2Db: SQLite.SQLiteDatabase | null = null;
  const file = dictionaryDbFile(l2);
  try {
    l2Db = await openOfflineDictionaryDB(l2);
  } catch (e) {
    logwarn('[DictDB] ❌ failed to open precompiled dict — l2:', l2, 'file:', dictionaryDbFileName(l2), 'error:', (e as Error)?.message ?? e);
    l2Db = null;
  }
  if (l2Db) {
    try {
      const table = dictTableName(l2);
      log('[DictDB] precompiled lookup — l2:', l2, 'text:', text, 'file:', dictionaryDbFileName(l2), 'table:', table);
      let rows = await l2Db.getAllAsync<{ entry_json: string }>(
        `SELECT entry_json FROM ${table} WHERE head = ? COLLATE NOCASE`,
        [text],
      );
      log('[DictDB] precompiled head rows — l2:', l2, 'text:', text, 'rows:', rows?.length ?? 0);
      if (!rows || rows.length === 0) {
        rows = await l2Db.getAllAsync<{ entry_json: string }>(
          `SELECT entry_json FROM ${table} WHERE alternate = ? COLLATE NOCASE`,
          [text],
        );
        log('[DictDB] precompiled alternate rows — l2:', l2, 'text:', text, 'rows:', rows?.length ?? 0);
      }
      if (rows && rows.length > 0) {
        log('[DictDB] ✅ precompiled hit — l2:', l2, 'text:', text, 'rows:', rows.length);
        return rows.map((r) => JSON.parse(r.entry_json) as DictionaryEntry);
      }
      log('[DictDB] precompiled miss — l2:', l2, 'text:', text, '— falling back to legacy central table');
    } catch (e) {
      logwarn('[DictDB] ❌ precompiled lookup failed — l2:', l2, 'text:', text, 'error:', (e as Error)?.message ?? e);
    }
  } else {
    log('[DictDB] no precompiled file — l2:', l2, 'file exists:', file.exists, '— trying legacy central table');
  }

  const db = await openDictionaryDB();
  const legacy = await lookupOffline(db, text, l2);
  log('[DictDB] legacy result — l2:', l2, 'text:', text, 'rows:', legacy?.length ?? 0);
  return legacy;
}

/**
 * Offline autocomplete: prefix-match headwords/alternates from the downloaded
 * dictionary. Used by the dictionary search bar when Offline Mode blocks the
 * server autocomplete endpoint.
 */
export async function autocompleteOffline(
  l2: string,
  query: string,
  limit = 20,
): Promise<DictionaryEntry[]> {
  const like = `${query}%`;
  const table = dictTableName(l2);

  let l2Db: SQLite.SQLiteDatabase | null = null;
  try {
    l2Db = await openOfflineDictionaryDB(l2);
  } catch {
    l2Db = null;
  }

  const parse = (rows: { entry_json: string }[] | null): DictionaryEntry[] =>
    (rows ?? []).map((r) => JSON.parse(r.entry_json) as DictionaryEntry);

  if (l2Db) {
    try {
      const rows = await l2Db.getAllAsync<{ entry_json: string }>(
        `SELECT entry_json FROM ${table}
         WHERE head LIKE ? COLLATE NOCASE OR alternate LIKE ? COLLATE NOCASE
         LIMIT ?`,
        [like, like, limit],
      );
      if (rows.length > 0) {
        log('[DictDB] ✅ offline autocomplete hit — l2:', l2, 'query:', query, 'rows:', rows.length);
        return parse(rows);
      }
    } catch (e) {
      logwarn('[DictDB] ❌ offline autocomplete failed — l2:', l2, 'query:', query, 'error:', (e as Error)?.message ?? e);
    }
  }

  const db = await openDictionaryDB();
  try {
    const rows = await db.getAllAsync<{ entry_json: string }>(
      `SELECT entry_json FROM ${table}
       WHERE head LIKE ? COLLATE NOCASE OR alternate LIKE ? COLLATE NOCASE
       LIMIT ?`,
      [like, like, limit],
    );
    return parse(rows);
  } catch (e) {
    logwarn('[DictDB] ❌ legacy offline autocomplete failed — l2:', l2, 'query:', query, 'error:', (e as Error)?.message ?? e);
    return [];
  }
}

// ── LLM cache ─────────────────────────────────

/**
 * Check the LLM cache for a previously generated entry.
 * Returns DictionaryEntry[] or null if not cached.
 */
export async function lookupLLMCache(
  db: SQLite.SQLiteDatabase,
  text: string,
  l1: string,
  l2: string,
): Promise<DictionaryEntry[] | null> {
  try {
    const row = await db.getFirstAsync<{ entry_json: string }>(
      'SELECT entry_json FROM llm_cache WHERE text = ? AND l1 = ? AND l2 = ?',
      [text, l1, l2],
    );
    if (!row) return null;
    return JSON.parse(row.entry_json) as DictionaryEntry[];
  } catch {
    return null;
  }
}

/**
 * Store an LLM-generated lookup result in the local cache.
 */
export async function storeLLMCacheEntry(
  db: SQLite.SQLiteDatabase,
  text: string,
  l1: string,
  l2: string,
  entries: DictionaryEntry[],
): Promise<void> {
  try {
    await db.runAsync(
      'INSERT OR REPLACE INTO llm_cache (text, l1, l2, entry_json) VALUES (?, ?, ?, ?)',
      [text, l1, l2, JSON.stringify(entries)],
    );
  } catch {
    // Non-fatal — LLM cache is best-effort
  }
}

// ── Bulk insert (download) ────────────────────

/** A pre-serialized dictionary row ready for direct SQLite insertion. */
export interface BulkEntryRow {
  id: string;
  head: string;
  alternate: string | null;
  pronunciation: string | null;
  entry_json: string;
}

/**
 * Drop and recreate the dict_{l2} table before a fresh download.
 *
 * This avoids `INSERT OR REPLACE` overhead and guarantees a clean table even
 * if a previous download crashed or was cancelled.
 */
export async function resetDictTable(
  db: SQLite.SQLiteDatabase,
  l2: string,
): Promise<void> {
  const table = dictTableName(l2);
  await db.execAsync(`DROP TABLE IF EXISTS ${table}`);
  // Deliberately no indexes here — they are created by finishBulkInsert().
  await ensureDictTable(db, l2);
}

/**
 * Start a streaming bulk-insert session for a fresh dictionary download.
 *
 * Drops/recreates the table without lookup indexes, then opens one transaction
 * for the entire download. Every insertBatch call joins this transaction, so
 * the app commits once and checkpoints the WAL once instead of paying that
 * cost after every 500-row batch.
 *
 * Must be paired with finishBulkInsert() on success or abortBulkInsert() on
 * failure.
 */
export async function beginBulkInsert(
  db: SQLite.SQLiteDatabase,
  l2: string,
): Promise<void> {
  await resetDictTable(db, l2);
  await db.execAsync('BEGIN IMMEDIATE');
}

/**
 * Insert one parsed batch inside the active bulk-insert transaction.
 */
export async function insertBulkBatch(
  db: SQLite.SQLiteDatabase,
  l2: string,
  entries: BulkEntryRow[],
  onProgress?: (pct: number) => void,
): Promise<void> {
  const table = dictTableName(l2);
  // Build the multi-row INSERT in one JS pass, then measure the two phases
  // separately so a slow download can be attributed to string building vs.
  // the native SQLite call.
  const buildStart = Date.now();
  const values = entries
    .map((r) => `('${esc(r.id)}','${esc(r.head)}',${escOrNull(r.alternate)},${escOrNull(r.pronunciation)},'${esc(r.entry_json)}')`)
    .join(',');
  const buildMs = Date.now() - buildStart;

  const txStart = Date.now();
  await db.execAsync(
    `INSERT OR REPLACE INTO ${table} (id, head, alternate, pronunciation, entry_json) VALUES ${values}`
  );
  const txMs = Date.now() - txStart;

  const avgEntryBytes = entries.length
    ? Math.round(entries.reduce((sum, r) => sum + r.entry_json.length, 0) / entries.length)
    : 0;
  log('[DictDB] batch — l2:', l2, 'rows:', entries.length,
    'avg entry_json:', avgEntryBytes, 'bytes',
    '— sql build:', buildMs, 'ms — exec:', txMs, 'ms');

  if (onProgress) {
    onProgress(100);
  }
}

/**
 * Commit the bulk-insert transaction, build the lookup indexes, and flush the
 * WAL once. Call this only after every batch has been inserted.
 */
export async function finishBulkInsert(
  db: SQLite.SQLiteDatabase,
  l2: string,
): Promise<void> {
  const commitStart = Date.now();
  await db.execAsync('COMMIT');
  log('[DictDB] ✅ bulk insert committed — l2:', l2, '— commit took', Date.now() - commitStart, 'ms');

  const idxStart = Date.now();
  await createDictIndexes(db, l2);
  log('[DictDB] 🧱 lookup indexes created — l2:', l2, '— took', Date.now() - idxStart, 'ms');

  const ckStart = Date.now();
  await db.execAsync('PRAGMA wal_checkpoint(TRUNCATE)');
  log('[DictDB] 🧹 WAL checkpoint done — l2:', l2, '— took', Date.now() - ckStart, 'ms');
}

/**
 * Roll back an in-progress bulk insert. Safe to call when no transaction is
 * open (e.g. the COMMIT already succeeded and index creation failed).
 */
export async function abortBulkInsert(db: SQLite.SQLiteDatabase): Promise<void> {
  try {
    await db.execAsync('ROLLBACK');
  } catch {
    // No open transaction — nothing to roll back.
  }
}

// ── Dictionary metadata ───────────────────────

/**
 * Record download completion in the metadata table.
 */
export async function saveDictMeta(
  db: SQLite.SQLiteDatabase,
  meta: DictMeta,
): Promise<void> {
  await db.runAsync(
    `INSERT OR REPLACE INTO dict_meta (l2, downloaded_at, entry_count, size_bytes, version)
     VALUES (?, ?, ?, ?, ?)`,
    [meta.l2, meta.downloaded_at, meta.entry_count, meta.size_bytes, meta.version],
  );
}

/**
 * Get download metadata for one language, or null if not downloaded.
 */
export async function getDictMeta(
  db: SQLite.SQLiteDatabase,
  l2: string,
): Promise<DictMeta | null> {
  try {
    const row = await db.getFirstAsync<DictMeta>(
      'SELECT l2, downloaded_at, entry_count, size_bytes, version FROM dict_meta WHERE l2 = ?',
      [l2],
    );
    return row ?? null;
  } catch {
    return null;
  }
}

/**
 * Get download metadata for all downloaded languages.
 */
export async function getAllDictMeta(
  db: SQLite.SQLiteDatabase,
): Promise<DictMeta[]> {
  try {
    return await db.getAllAsync<DictMeta>(
      'SELECT l2, downloaded_at, entry_count, size_bytes, version FROM dict_meta ORDER BY l2',
    );
  } catch {
    return [];
  }
}

// ── Delete ────────────────────────────────────

/**
 * Delete the offline dictionary for a language.
 * Drops the dict_{l2} table and removes metadata.
 */
export async function deleteDictionary(
  db: SQLite.SQLiteDatabase,
  l2: string,
): Promise<void> {
  await closeOfflineDictionaryDB(l2);
  const file = dictionaryDbFile(l2);
  if (file.exists) {
    file.delete();
    log('[DictDB] 🗑 deleted precompiled dictionary file — l2:', l2);
  }
  const table = dictTableName(l2);
  try {
    await db.execAsync(`DROP TABLE IF EXISTS ${table}`);
    // Flush WAL to recover space and prevent slowdown on re-download
    log('[DictDB] 🧹 WAL checkpoint after DROP — l2:', l2);
    await db.execAsync('PRAGMA wal_checkpoint(TRUNCATE)');
    log('[DictDB] ✅ WAL checkpoint done — l2:', l2);
  } catch {
    // Table may not exist — that's fine
  }
  try {
    await db.runAsync('DELETE FROM dict_meta WHERE l2 = ?', [l2]);
  } catch {
    // dict_meta may not exist if orphan cleanup dropped it
  }
  await shrinkDictionaryDB(db);
}

/**
 * Delete ALL offline dictionaries and LLM cache.
 */
export async function deleteAllDictionaries(
  db: SQLite.SQLiteDatabase,
): Promise<void> {
  for (const l2 of [...l2DbCache.keys()]) {
    await closeOfflineDictionaryDB(l2);
  }
  const dir = new Directory(DICTIONARIES_DIR_URI);
  if (dir.exists) {
    for (const entry of dir.list()) {
      if (entry instanceof File && entry.name.endsWith('.db')) {
        try { entry.delete(); } catch { /* already gone */ }
      }
    }
  }

  // Drop all dict_* tables
  try {
    const tables = await db.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'dict_%' AND name != 'dict_meta'",
    );
    for (const t of tables) {
      await db.execAsync(`DROP TABLE IF EXISTS ${t.name}`);
    }
  } catch {
    // Best-effort cleanup
  }

  // Clear shared tables
  await db.execAsync('DELETE FROM llm_cache');
  await db.execAsync('DELETE FROM dict_meta');
  // Flush WAL to recover space
  log('[DictDB] 🧹 WAL checkpoint after delete-all');
  try { await db.execAsync('PRAGMA wal_checkpoint(TRUNCATE)'); } catch {}
  log('[DictDB] ✅ WAL checkpoint done');
  await shrinkDictionaryDB(db);
}

// ── Storage usage ─────────────────────────────

/**
 * Estimate the total storage used by offline dictionaries (in bytes).
 * Uses SQLite's page-count heuristics — approximate but fast.
 */
export async function getStorageUsage(
  db: SQLite.SQLiteDatabase,
): Promise<{ usedBytes: number }> {
  try {
    // Sum page_count * page_size for all dict_* tables
    const rows = await db.getAllAsync<{ pgsize: number; total_pages: number }>(`
      SELECT
        (SELECT page_size FROM pragma_page_size()) AS pgsize,
        SUM(pager_stats.npage) AS total_pages
      FROM pragma_database_list
      LEFT JOIN pragma_pager_stats AS pager_stats ON pager_stats.name = 'main'
    `);
    // Fallback: if pragma fails, estimate from sqlite_master
    if (!rows || rows.length === 0) {
      let usedBytes = 0;
      const dir = new Directory(DICTIONARIES_DIR_URI);
      if (dir.exists) {
        for (const entry of dir.list()) {
          if (entry instanceof File && entry.name.endsWith('.db')) {
            usedBytes += entry.size;
          }
        }
      }
      return { usedBytes };
    }
    const r = rows[0]!;
    let usedBytes = (r.pgsize || 4096) * (r.total_pages || 0);
    const dir = new Directory(DICTIONARIES_DIR_URI);
    if (dir.exists) {
      for (const entry of dir.list()) {
        if (entry instanceof File && entry.name.endsWith('.db')) {
          usedBytes += entry.size;
        }
      }
    }
    return { usedBytes };
  } catch {
    return { usedBytes: 0 };
  }
}

/**
 * Check whether an offline dictionary exists for a language
 * (fast — just checks dict_meta, doesn't scan the table).
 */
export async function hasOfflineDictionary(
  db: SQLite.SQLiteDatabase,
  l2: string,
): Promise<boolean> {
  const meta = await getDictMeta(db, l2);
  return meta !== null && meta.entry_count > 0;
}

/**
 * Check whether a language is downloaded, preferring the per-language
 * precompiled file and falling back to the legacy central table.
 */
export async function hasOfflineDictionaryByL2(l2: string): Promise<boolean> {
  if (dictionaryDbFile(l2).exists) return true;
  const db = await openDictionaryDB();
  return hasOfflineDictionary(db, l2);
}

/** Entry count for a language from either the file's dict_meta or central DB. */
export async function getDownloadedCountByL2(l2: string): Promise<number> {
  const meta = await getDictMetaForL2(l2);
  return meta?.entry_count ?? 0;
}
