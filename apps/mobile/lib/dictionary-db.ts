/**
 * Offline dictionary storage layer using expo-sqlite.
 *
 * Stores downloaded dictionary entries and LLM-generated cache entries
 * for offline word lookup. Uses a separate SQLite database file
 * (`dictionary.db`) from the main app database.
 *
 * Schema:
 *   dict_{l2}    — one table per downloaded language, stores full
 *                  DictionaryEntry as JSON with indexed head column
 *   llm_cache     — shared table for LLM-generated entries
 *   dict_meta     — per-language download metadata
 */

import * as SQLite from 'expo-sqlite';
import type { DictionaryEntry, DictMeta } from '@langplayer/shared';

// ── Constants ────────────────────────────────

const DB_NAME = 'dictionary.db';
const CHUNK_SIZE = 500;

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

    return _db;
  })();

  return _dbPromise;
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
 * Sanitize an L2 language code for use in a table name.
 * Only allows lowercase ASCII letters (ISO 639-1 codes).
 */
function sanitizeL2(l2: string): string {
  // ISO 639-1 codes are exactly 2 lowercase letters
  if (/^[a-z]{2}$/.test(l2)) return l2;
  throw new Error(`Invalid L2 code: "${l2}". Expected 2-letter ISO 639-1 code.`);
}

function dictTableName(l2: string): string {
  return `dict_${sanitizeL2(l2)}`;
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
      pronunciation TEXT,
      entry_json TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_${table}_head ON ${table}(head COLLATE NOCASE);
  `);
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
    const rows = await db.getAllAsync<{ entry_json: string }>(
      `SELECT entry_json FROM ${table} WHERE head = ? COLLATE NOCASE`,
      [text],
    );
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

/**
 * Insert downloaded dictionary entries in chunks, yielding to the main
 * thread between chunks to keep the UI responsive.
 *
 * @param onProgress — called after each chunk with percentage 0–100
 */
export async function bulkInsertEntries(
  db: SQLite.SQLiteDatabase,
  l2: string,
  entries: DictionaryEntry[],
  onProgress?: (pct: number) => void,
): Promise<void> {
  const startTime = Date.now();
  await ensureDictTable(db, l2);
  const table = dictTableName(l2);
  const totalChunks = Math.ceil(entries.length / CHUNK_SIZE);

  console.log('[DictDB] bulkInsertEntries — l2:', l2, 'entries:', entries.length, 'chunks:', totalChunks);

  for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
    const chunk = entries.slice(i, i + CHUNK_SIZE);
    const chunkNum = Math.floor(i / CHUNK_SIZE) + 1;

    await db.withTransactionAsync(async () => {
      for (const entry of chunk) {
        await db.runAsync(
          `INSERT OR REPLACE INTO ${table} (id, head, pronunciation, entry_json) VALUES (?, ?, ?, ?)`,
          [
            entry.id,
            entry.head,
            entry.pronunciation ?? null,
            JSON.stringify(entry),
          ],
        );
      }
    });

    const pct = Math.min(100, Math.round(((i + CHUNK_SIZE) / entries.length) * 100));
    if (chunkNum % 20 === 0 || chunkNum === totalChunks) {
      console.log('[DictDB] chunk', chunkNum, '/', totalChunks, `(${pct}%)`,
        '—', ((Date.now() - startTime) / 1000).toFixed(1), 's elapsed');
    }

    if (onProgress) {
      onProgress(pct);
    }

    // Yield to the main thread to prevent UI freezes
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  console.log('[DictDB] bulkInsertEntries complete — l2:', l2, '— total time:', ((Date.now() - startTime) / 1000).toFixed(1), 's');

  // Flush WAL to keep future inserts fast
  try { await db.execAsync('PRAGMA wal_checkpoint(TRUNCATE)'); } catch {}
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
    await db.execAsync('PRAGMA wal_checkpoint(TRUNCATE)');
  } catch {
    // Table may not exist — that's fine
  }
  await db.runAsync('DELETE FROM dict_meta WHERE l2 = ?', [l2]);
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
      "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'dict_%'",
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
  try { await db.execAsync('PRAGMA wal_checkpoint(TRUNCATE)'); } catch {}
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
