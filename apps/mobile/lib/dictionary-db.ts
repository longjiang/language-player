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
import type { DictionaryEntry, DictMeta } from '@langplayer/shared';
import { log } from '@/lib/logger';

// ── Constants ────────────────────────────────

const DB_NAME = 'dictionary.db';
const CHUNK_SIZE = 500;

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
 * Create the dict_{l2} table (if it doesn't exist) with indexes.
 * Called before inserting entries for a language.
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
    // Primary: head match (simplified for zh). Mirrors the server's
    // `head = ? OR alternate = ?` lookup so traditional text resolves to
    // the same entry offline. Two indexed queries keep this fast.
    let rows = await db.getAllAsync<{ entry_json: string }>(
      `SELECT entry_json FROM ${table} WHERE head = ? COLLATE NOCASE`,
      [text],
    );
    if (!rows || rows.length === 0) {
      rows = await db.getAllAsync<{ entry_json: string }>(
        `SELECT entry_json FROM ${table} WHERE alternate = ? COLLATE NOCASE`,
        [text],
      );
    }
    if (!rows || rows.length === 0) return null;
    return rows.map((r) => JSON.parse(r.entry_json) as DictionaryEntry);
  } catch {
    // Table doesn't exist yet (not downloaded for this language)
    return null;
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
  await ensureDictTable(db, l2);
}

/**
 * Insert downloaded dictionary rows in chunks, yielding to the main
 * thread between chunks to keep the UI responsive.
 *
 * Rows are pre-serialized (`entry_json` is already a JSON string), so no
 * per-entry JSON.stringify happens here. The caller must prepare the table
 * first with `resetDictTable()`.
 *
 * @param onProgress — called after each chunk with percentage 0–100
 */
export async function bulkInsertEntries(
  db: SQLite.SQLiteDatabase,
  l2: string,
  entries: BulkEntryRow[],
  onProgress?: (pct: number) => void,
): Promise<void> {
  const startTime = Date.now();
  const table = dictTableName(l2);
  const totalChunks = Math.ceil(entries.length / CHUNK_SIZE);

  log('[DictDB] bulkInsertEntries — l2:', l2, 'entries:', entries.length, 'chunks:', totalChunks);

  for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
    const chunk = entries.slice(i, i + CHUNK_SIZE);
    const chunkNum = Math.floor(i / CHUNK_SIZE) + 1;
    const chunkStart = Date.now();

    // Build multi-row INSERT to minimize JS↔native bridge roundtrips.
    // Each roundtrip costs 1-4ms; 500 individual runAsync calls = ~2000ms.
    // A single execAsync with all 500 rows = 1 roundtrip.
    const txStart = Date.now();
    const values = chunk
      .map((r) => `('${esc(r.id)}','${esc(r.head)}',${escOrNull(r.alternate)},${escOrNull(r.pronunciation)},'${esc(r.entry_json)}')`)
      .join(',');
    await db.execAsync(
      `INSERT OR REPLACE INTO ${table} (id, head, alternate, pronunciation, entry_json) VALUES ${values}`
    );
    const txMs = Date.now() - txStart;

    const chunkMs = Date.now() - chunkStart;
    const pct = Math.min(100, Math.round(((i + CHUNK_SIZE) / entries.length) * 100));

    // Log every chunk for first 10, then every 10th, then every 20th
    const shouldLog = chunkNum <= 10 || chunkNum % 10 === 0 || chunkNum === totalChunks;
    if (shouldLog) {
      log('[DictDB] chunk', chunkNum, '/', totalChunks, `(${pct}%)`,
        '— tx:', txMs, 'ms total:', chunkMs, 'ms',
        '—', ((Date.now() - startTime) / 1000).toFixed(1), 's elapsed');
    }

    if (onProgress) {
      onProgress(pct);
    }

    // Yield to the main thread to prevent UI freezes
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  log('[DictDB] bulkInsertEntries complete — l2:', l2, '— total time:', ((Date.now() - startTime) / 1000).toFixed(1), 's');

  // Flush WAL to keep future inserts fast
  log('[DictDB] 🧹 WAL checkpoint after bulk insert — l2:', l2);
  try { await db.execAsync('PRAGMA wal_checkpoint(TRUNCATE)'); } catch {}
  log('[DictDB] ✅ WAL checkpoint done — l2:', l2);
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
      return { usedBytes: 0 };
    }
    const r = rows[0]!;
    return { usedBytes: (r.pgsize || 4096) * (r.total_pages || 0) };
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
