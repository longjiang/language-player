/**
 * Lemma table storage layer for offline lemmatization (SPEC-018 Phase 2a).
 *
 * Stores downloaded {surface → [lemma, ...]} mapping tables in the same
 * SQLite database as the offline dictionary (`dictionary.db`). Each
 * language gets its own `lemma_{l2}` table.
 *
 * Schema (in dictionary.db):
 *   lemma_{l2}   — one table per downloaded language
 *                   surface TEXT PRIMARY KEY  — inflected word form
 *                   lemmas TEXT NOT NULL       — JSON array of lemma strings
 *   lemma_meta    — per-language download metadata
 *                   l2 TEXT PRIMARY KEY
 *                   downloaded_at TEXT NOT NULL
 *                   entry_count INTEGER NOT NULL
 *                   size_bytes INTEGER
 */

import * as SQLite from 'expo-sqlite';
import { Directory, File, Paths } from 'expo-file-system';
import { openDictionaryDB } from './dictionary-db';

// ── Constants ────────────────────────────────

const CHUNK_SIZE = 500;

/**
 * Version stamp for downloaded lemma tables (SPEC-018 cap policy, 2026-08-08).
 * Bump when the download policy or table source changes so existing installs
 * re-download instead of keeping stale rows (e.g. old 50k-capped tables).
 */
const LEMMA_TABLE_VERSION = 2;

/** Escape a string for safe inclusion in a SQL string literal. */
function esc(s: string): string {
  return s.replace(/'/g, "''");
}

// ── Schema ───────────────────────────────────

/**
 * Ensure the lemma_meta table exists (shared across all languages).
 * Called once when the DB is opened.
 */
async function ensureLemmaMeta(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS lemma_meta (
      l2 TEXT PRIMARY KEY,
      downloaded_at TEXT NOT NULL,
      entry_count INTEGER NOT NULL,
      size_bytes INTEGER,
      version INTEGER NOT NULL DEFAULT 1
    );
  `);
  // Migrate tables created before the version column existed (default to v1,
  // which is stale after the cap-policy change — hasLemmaTable will miss it).
  try {
    await db.execAsync('ALTER TABLE lemma_meta ADD COLUMN version INTEGER NOT NULL DEFAULT 1');
  } catch {
    // Column already exists — fine.
  }
}

/**
 * Create the lemma_{l2} table for a language if it doesn't exist.
 */
async function ensureLemmaTable(db: SQLite.SQLiteDatabase, l2: string): Promise<void> {
  const safeL2 = l2.replace(/-/g, '_');
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS lemma_${safeL2} (
      surface TEXT PRIMARY KEY,
      lemmas TEXT NOT NULL
    );
  `);
  // Index for fast lookups
  await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_lemma_${safeL2}_surface ON lemma_${safeL2}(surface);`);
}

// ── Public API ───────────────────────────────

/**
 * Check if a lemma table has been downloaded for a language.
 */
export async function hasLemmaTable(l2: string): Promise<boolean> {
  const db = await openDictionaryDB();
  const row = await db.getFirstAsync<{ cnt: number }>(
    'SELECT COUNT(*) as cnt FROM lemma_meta WHERE l2 = ? AND version >= ?',
    [l2, LEMMA_TABLE_VERSION],
  );
  return (row?.cnt ?? 0) > 0;
}

/**
 * Get lemma table metadata for a language, or null if not downloaded.
 */
export async function getLemmaMeta(l2: string): Promise<{
  l2: string;
  downloaded_at: string;
  entry_count: number;
  size_bytes: number | null;
  version: number;
} | null> {
  const db = await openDictionaryDB();
  return db.getFirstAsync(
    'SELECT l2, downloaded_at, entry_count, size_bytes, version FROM lemma_meta WHERE l2 = ?',
    [l2],
  );
}

/**
 * Look up lemmas for a surface form in the downloaded lemma table.
 * Returns an array of lemma strings, or null if not found.
 */
export async function lookupLemma(
  l2: string,
  surface: string,
): Promise<string[] | null> {
  try {
    const db = await openDictionaryDB();
    const safeL2 = l2.replace(/-/g, '_');
    const row = await db.getFirstAsync<{ lemmas: string }>(
      `SELECT lemmas FROM lemma_${safeL2} WHERE surface = ?`,
      [surface],
    );
    if (!row) return null;
    return JSON.parse(row.lemmas) as string[];
  } catch {
    // Table doesn't exist or query failed — no lemma data for this language
    return null;
  }
}

/**
 * Look up lemmas for many surface forms in one query (chunked to stay under
 * SQLite's variable limit). Returns a map of surface → lemma list for the
 * forms found; surfaces with no entry are absent from the map.
 */
export async function lookupLemmasBatch(
  l2: string,
  surfaces: string[],
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  const unique = [...new Set(surfaces.filter((s) => s.length > 0))];
  if (unique.length === 0) return out;

  try {
    const db = await openDictionaryDB();
    const safeL2 = l2.replace(/-/g, '_');
    for (let i = 0; i < unique.length; i += CHUNK_SIZE) {
      const chunk = unique.slice(i, i + CHUNK_SIZE);
      const placeholders = chunk.map(() => '?').join(', ');
      const rows = await db.getAllAsync<{ surface: string; lemmas: string }>(
        `SELECT surface, lemmas FROM lemma_${safeL2} WHERE surface IN (${placeholders})`,
        chunk,
      );
      for (const row of rows ?? []) {
        try {
          out.set(row.surface, JSON.parse(row.lemmas) as string[]);
        } catch {
          // Corrupt row — skip
        }
      }
    }
    return out;
  } catch {
    // Table doesn't exist or query failed — no lemma data for this language
    return out;
  }
}

/**
 * Store a full lemma table (batch insert).
 *
 * @param l2 - Language code
 * @param entries - Array of [surface, lemmas] tuples (lemmas is string[])
 * @param sizeBytes - Estimated download size for metadata
 */
export async function storeLemmaTable(
  l2: string,
  entries: Array<[string, string[]]>,
  sizeBytes?: number,
): Promise<void> {
  const db = await openDictionaryDB();
  await ensureLemmaMeta(db);
  await ensureLemmaTable(db, l2);

  const safeL2 = l2.replace(/-/g, '_');

  // Delete existing data (re-download scenario)
  await db.execAsync(`DELETE FROM lemma_${safeL2}`);

  // Bulk insert in chunks
  for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
    const chunk = entries.slice(i, i + CHUNK_SIZE);
    const values = chunk
      .map(([surface, lemmas]) => `('${esc(surface)}', '${esc(JSON.stringify(lemmas))}')`)
      .join(', ');
    await db.execAsync(`INSERT OR REPLACE INTO lemma_${safeL2} (surface, lemmas) VALUES ${values}`);
  }

  // Store metadata
  await db.runAsync(
    'INSERT OR REPLACE INTO lemma_meta (l2, downloaded_at, entry_count, size_bytes, version) VALUES (?, datetime(\'now\'), ?, ?, ?)',
    [l2, entries.length, sizeBytes ?? null, LEMMA_TABLE_VERSION],
  );
}

/**
 * Delete a lemma table for a language (e.g., when dictionary is deleted).
 */
export async function deleteLemmaTable(l2: string): Promise<void> {
  const db = await openDictionaryDB();
  const safeL2 = l2.replace(/-/g, '_');
  await db.execAsync(`DROP TABLE IF EXISTS lemma_${safeL2}`);
  await db.runAsync('DELETE FROM lemma_meta WHERE l2 = ?', [l2]);
}

/**
 * Download a lemma table from the server and store it in SQLite.
 *
 * @param l2 - Language code (ISO 639-1 or 639-3)
 * @param apiUrl - Python server base URL
 * @param limit - Optional row cap (SPEC-018 cap policy). Omitted = full table.
 *
 * Returns true if download succeeded, false if it failed (network error,
 * server doesn't have data for this language, etc.).
 */
export async function downloadLemmaTable(
  l2: string,
  apiUrl: string,
  limit?: number,
  signal?: AbortSignal,
): Promise<boolean> {
  try {
    const url = `${apiUrl}/lemmatization/export?l2=${encodeURIComponent(l2)}&format=json${limit ? `&limit=${limit}` : ''}`;
    const response = await fetch(url, { signal });
    if (!response.ok) return false;

    const data = await response.json() as { table: Record<string, string[]> };
    if (!data.table || Object.keys(data.table).length === 0) return false;

    const entries: Array<[string, string[]]> = Object.entries(data.table);
    await storeLemmaTable(l2, entries);
    return true;
  } catch (e) {
    if (signal?.aborted) throw e;
    return false;
  }
}

// ── Phase 2c: kuromoji data pack ────────────────────────────────────
// Downloaded IPADIC dictionary files (.dat.gz) stored on the device
// filesystem for kuromoji's Japanese morphological analysis.
// Hosted as a zip archive at GET /lemmatization/download?l2=ja.

const TOKENIZER_DIR = `${Paths.document.uri}tokenizers/`;

/**
 * Files that make up the kuromoji IPADIC dictionary data pack.
 * Same file list as kuromoji's DictionaryLoader.load() expects.
 */
export const KROMOJI_DICT_FILES = [
  'base.dat.gz',
  'check.dat.gz',
  'tid.dat.gz',
  'tid_pos.dat.gz',
  'tid_map.dat.gz',
  'cc.dat.gz',
  'unk.dat.gz',
  'unk_pos.dat.gz',
  'unk_map.dat.gz',
  'unk_char.dat.gz',
  'unk_compat.dat.gz',
  'unk_invoke.dat.gz',
];

/**
 * Check if the kuromoji data pack has been downloaded for a language.
 *
 * @param l2 - Language code (e.g., 'ja')
 * @returns true if all required dictionary files exist on disk
 */
export async function hasKuromojiData(l2: string): Promise<boolean> {
  const dir = `${TOKENIZER_DIR}${l2}/`;
  try {
    return KROMOJI_DICT_FILES.every((f) => new File(`${dir}${f}`).exists);
  } catch {
    return false;
  }
}

/**
 * Get the local filesystem path for a language's kuromoji data directory.
 *
 * @param l2 - Language code
 * @returns Absolute path ending with '/' where .dat.gz files are stored
 */
export function getKuromojiDataPath(l2: string): string {
  return `${TOKENIZER_DIR}${l2}/`;
}

/**
 * Download the kuromoji IPADIC data pack for a language and extract it
 * to the device filesystem.
 *
 * The server hosts a zip archive at GET /lemmatization/download?l2=ja
 * containing all .dat.gz files. We download the zip, extract each file,
 * and store them individually in {TOKENIZER_DIR}{l2}/.
 *
 * Returns true if download and extraction succeeded, false on any error
 * (network error, server unavailable, corrupt zip, etc.).
 */
export async function downloadKuromojiData(
  l2: string,
  apiUrl: string,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<boolean> {
  const dir = new Directory(`${TOKENIZER_DIR}${l2}/`);
  const zipPath = `${TOKENIZER_DIR}${l2}.zip`;

  try {
    // Ensure the target directory exists
    dir.create({ intermediates: true, idempotent: true });

    // Download the zip archive from the server
    const zipFile = new File(zipPath);
    if (zipFile.exists) zipFile.delete();
    await File.downloadFileAsync(
      `${apiUrl}/lemmatization/download?l2=${encodeURIComponent(l2)}`,
      zipFile,
      {
        idempotent: true,
        signal,
        onProgress: (progress) => {
          if (progress.totalBytes > 0) {
            onProgress?.(0.9 * Math.min(1, progress.bytesWritten / progress.totalBytes));
          } else if (progress.bytesWritten > 0) {
            onProgress?.(0.9 * 0.1);
          }
        },
      },
    );

    // Read the zip as raw bytes (no base64 round-trip)
    const zipData = await zipFile.bytes();

    // Decompress zip using fflate (pure JS, no native deps, already installed)
    const { unzipSync } = await import('fflate');
    const unzipped = unzipSync(zipData);

    // Write each extracted file to the tokenizer directory
    const files = Object.entries(unzipped).filter(([filePath]) =>
      KROMOJI_DICT_FILES.includes(filePath)
    );
    for (let i = 0; i < files.length; i++) {
      // Only extract known .dat.gz files (ignore metadata/readme)
      if (signal?.aborted) throw new Error('Download cancelled');
      const [filePath, content] = files[i]!;
      const fullPath = `${dir.uri}${filePath}`;
      const out = new File(fullPath);
      out.create({ intermediates: true, overwrite: true });
      out.write(content);
      onProgress?.(0.9 + 0.1 * ((i + 1) / files.length));
    }

    // Clean up the zip file
    if (zipFile.exists) zipFile.delete();

    return true;
  } catch (e) {
    // Clean up partial extraction so hasKuromojiData doesn't report success
    try {
      if (dir.exists) dir.delete();
      const zipFile = new File(zipPath);
      if (zipFile.exists) zipFile.delete();
    } catch {}
    if (signal?.aborted) throw e;
    // Silent failure — non-fatal, falls back to regex + surface-as-lemma
    return false;
  }
}

/**
 * Delete kuromoji data pack files for a language from the device.
 *
 * @param l2 - Language code
 */
export async function deleteKuromojiData(l2: string): Promise<void> {
  const dir = new Directory(`${TOKENIZER_DIR}${l2}/`);
  if (dir.exists) dir.delete();
  // Also clean up any leftover zip
  const zipFile = new File(`${TOKENIZER_DIR}${l2}.zip`);
  if (zipFile.exists) zipFile.delete();
}
