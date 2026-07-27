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
import { openDictionaryDB } from './dictionary-db';

// ── Constants ────────────────────────────────

const CHUNK_SIZE = 500;

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
      size_bytes INTEGER
    );
  `);
}

/**
 * Create the lemma_{l2} table for a language if it doesn't exist.
 */
async function ensureLemmaTable(db: SQLite.SQLiteDatabase, l2: string): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS lemma_${l2} (
      surface TEXT PRIMARY KEY,
      lemmas TEXT NOT NULL
    );
  `);
  // Index for fast lookups
  await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_lemma_${l2}_surface ON lemma_${l2}(surface);`);
}

// ── Public API ───────────────────────────────

/**
 * Check if a lemma table has been downloaded for a language.
 */
export async function hasLemmaTable(l2: string): Promise<boolean> {
  const db = await openDictionaryDB();
  const row = await db.getFirstAsync<{ cnt: number }>(
    'SELECT COUNT(*) as cnt FROM lemma_meta WHERE l2 = ?',
    [l2],
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
} | null> {
  const db = await openDictionaryDB();
  return db.getFirstAsync(
    'SELECT l2, downloaded_at, entry_count, size_bytes FROM lemma_meta WHERE l2 = ?',
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
    const row = await db.getFirstAsync<{ lemmas: string }>(
      `SELECT lemmas FROM lemma_${l2} WHERE surface = ?`,
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

  // Delete existing data (re-download scenario)
  await db.execAsync(`DELETE FROM lemma_${l2}`);

  // Bulk insert in chunks
  for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
    const chunk = entries.slice(i, i + CHUNK_SIZE);
    const values = chunk
      .map(([surface, lemmas]) => `('${esc(surface)}', '${esc(JSON.stringify(lemmas))}')`)
      .join(', ');
    await db.execAsync(`INSERT OR REPLACE INTO lemma_${l2} (surface, lemmas) VALUES ${values}`);
  }

  // Store metadata
  await db.runAsync(
    'INSERT OR REPLACE INTO lemma_meta (l2, downloaded_at, entry_count, size_bytes) VALUES (?, datetime(\'now\'), ?, ?)',
    [l2, entries.length, sizeBytes ?? null],
  );
}

/**
 * Delete a lemma table for a language (e.g., when dictionary is deleted).
 */
export async function deleteLemmaTable(l2: string): Promise<void> {
  const db = await openDictionaryDB();
  await db.execAsync(`DROP TABLE IF EXISTS lemma_${l2}`);
  await db.runAsync('DELETE FROM lemma_meta WHERE l2 = ?', [l2]);
}

/**
 * Download a lemma table from the server and store it in SQLite.
 *
 * Returns true if download succeeded, false if it failed (network error,
 * server doesn't have data for this language, etc.).
 */
export async function downloadLemmaTable(
  l2: string,
  apiUrl: string,
): Promise<boolean> {
  try {
    const response = await fetch(`${apiUrl}/lemmatization/export?l2=${encodeURIComponent(l2)}&format=json`);
    if (!response.ok) return false;

    const data = await response.json() as { table: Record<string, string[]> };
    if (!data.table || Object.keys(data.table).length === 0) return false;

    const entries: Array<[string, string[]]> = Object.entries(data.table);
    await storeLemmaTable(l2, entries);
    return true;
  } catch {
    return false;
  }
}

// ── Phase 2c: kuromoji data pack ────────────────────────────────────
// Downloaded IPADIC dictionary files (.dat.gz) stored on the device
// filesystem for kuromoji's Japanese morphological analysis.
// Hosted as a zip archive at GET /lemmatization/download?l2=ja.

import * as FileSystem from 'expo-file-system/legacy';

const TOKENIZER_DIR = `${FileSystem.documentDirectory}tokenizers/`;

/**
 * Files that make up the kuromoji IPADIC dictionary data pack.
 * Same file list as kuromoji's DictionaryLoader.load() expects.
 */
const KROMOJI_DICT_FILES = [
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
    const results = await Promise.all(
      KROMOJI_DICT_FILES.map((f) =>
        FileSystem.getInfoAsync(`${dir}${f}`).then((r) => r.exists),
      ),
    );
    return results.every(Boolean);
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
): Promise<boolean> {
  const dir = `${TOKENIZER_DIR}${l2}/`;
  const zipPath = `${TOKENIZER_DIR}${l2}.zip`;

  try {
    // Ensure the target directory exists
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });

    // Download the zip archive from the server
    const downloadResult = await FileSystem.downloadAsync(
      `${apiUrl}/lemmatization/download?l2=${encodeURIComponent(l2)}`,
      zipPath,
    );
    // Verify the download produced a file
    if (!downloadResult.uri) return false;

    // Read the zip file as base64
    const zipBase64 = await FileSystem.readAsStringAsync(downloadResult.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // Convert base64 → Uint8Array for fflate
    const binaryStr = atob(zipBase64);
    const zipData = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      zipData[i] = binaryStr.charCodeAt(i);
    }

    // Decompress zip using fflate (pure JS, no native deps, already installed)
    const { unzipSync } = await import('fflate');
    const unzipped = unzipSync(zipData);

    // Write each extracted file to the tokenizer directory
    for (const [filePath, content] of Object.entries(unzipped)) {
      // Only extract known .dat.gz files (ignore metadata/readme)
      if (!KROMOJI_DICT_FILES.includes(filePath)) continue;

      const fullPath = `${dir}${filePath}`;
      // Convert Uint8Array → base64 for expo-file-system write
      let binary = '';
      for (let i = 0; i < content.length; i++) {
        binary += String.fromCharCode(content[i]);
      }
      await FileSystem.writeAsStringAsync(fullPath, btoa(binary), {
        encoding: FileSystem.EncodingType.Base64,
      });
    }

    // Clean up the zip file
    await FileSystem.deleteAsync(downloadResult.uri, { idempotent: true });

    return true;
  } catch {
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
  const dir = `${TOKENIZER_DIR}${l2}/`;
  await FileSystem.deleteAsync(dir, { idempotent: true });
  // Also clean up any leftover zip
  const zipPath = `${TOKENIZER_DIR}${l2}.zip`;
  await FileSystem.deleteAsync(zipPath, { idempotent: true });
}
