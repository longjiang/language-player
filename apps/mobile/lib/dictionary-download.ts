/**
 * Streaming offline-dictionary downloader.
 *
 * Primary path: download a precompiled, gzipped SQLite database
 * (`?format=db`) and replace the per-language file directly — no client-side
 * row insertion.
 *
 * Legacy path: download the dictionary export as NDJSON (`?format=ndjson`)
 * into the cache directory, then parse it line-by-line with a FileHandle.
 * Each line is `[id, head, pronunciation, entry_json]`, so rows can be
 * inserted into SQLite without ever building one giant JS array or
 * re-serializing every entry.
 *
 * If the server is still running the old JSON-only version, the file is
 * detected as non-NDJSON and parsed with the previous JSON fallback.
 */

import {
  Directory,
  File,
  FileMode,
  Paths,
  type FileHandle,
} from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import type { DictionaryDownloadResponse, DictionaryEntry, DictMeta } from '@langplayer/shared';
import { PYTHON_API_URL } from '@/lib/api-url';
import { log } from '@/lib/logger';
import { savePrecompiledDictionary } from './dictionary-db';

const NDJSON_MARKER = '#langplayer-ndjson-v1';
const ROW_BATCH_SIZE = 2000;
const READ_CHUNK_SIZE = 256 * 1024;

export interface OfflineDictMeta {
  total: number;
  freq_count: number;
  downloaded: number;
  capped: boolean;
  version: string;
}

export interface OfflineDictRow {
  id: string;
  head: string;
  /** Traditional script form (zh/yue). Null when the entry has none. */
  alternate: string | null;
  pronunciation: string | null;
  entry_json: string;
}

export interface DictionaryDownloadCallbacks {
  /** Network transfer progress, 0..1. */
  onDownloadProgress?: (fraction: number) => void;
  /** Called once the metadata line is parsed. */
  onMeta?: (meta: OfflineDictMeta) => void;
  /**
   * Called with each batch of rows to insert.
   * `processed` is the number of rows parsed so far, `total` is the number
   * the server said it would send.
   */
  onRows?: (
    rows: OfflineDictRow[],
    processed: number,
    total: number,
  ) => Promise<void> | void;
}

class NotNdjsonError extends Error {}

async function authHeaders(): Promise<Record<string, string>> {
  try {
    const token = await SecureStore.getItemAsync('authToken');
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

async function downloadToCache(
  url: string,
  l2: string,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<File> {
  const dir = new Directory(Paths.cache, 'dictionary-download');
  dir.create({ intermediates: true, idempotent: true });
  const file = new File(dir, `dictionary-${l2}-${Date.now()}.jsonl`);
  const headers = await authHeaders();

  await File.downloadFileAsync(url, file, {
    idempotent: true,
    headers,
    signal,
    onProgress: (progress) => {
      if (progress.totalBytes > 0) {
        onProgress?.(Math.min(1, progress.bytesWritten / progress.totalBytes));
      } else if (progress.bytesWritten > 0) {
        // No Content-Length (chunked transfer): show activity instead of 0%.
        onProgress?.(0.1);
      }
    },
  });
  return file;
}

function rowsFromEntries(data: DictionaryDownloadResponse): OfflineDictRow[] {
  return data.entries.map((entry) => ({
    id: String(entry.id ?? ''),
    head: entry.head ?? '',
    alternate: entry.alternate ?? null,
    pronunciation: entry.pronunciation ?? null,
    entry_json: JSON.stringify(entry),
  }));
}

async function streamNdjson(
  file: File,
  callbacks: DictionaryDownloadCallbacks,
  signal?: AbortSignal,
  l2?: string,
): Promise<OfflineDictMeta> {
  const handle: FileHandle = file.open(FileMode.ReadOnly);
  const decoder = new TextDecoder('utf-8');
  let pending = '';
  let firstLine = true;
  let isNdjson = false;
  let meta: OfflineDictMeta | null = null;
  let batch: OfflineDictRow[] = [];
  let processed = 0;

  const flushBatch = async () => {
    if (batch.length === 0) return;
    const rows = batch;
    batch = [];
    const total = meta?.downloaded || meta?.total || rows.length;
    await callbacks.onRows?.(rows, processed, total);
  };

  const processLine = async (line: string) => {
    if (firstLine) {
      firstLine = false;
      if (line === NDJSON_MARKER) {
        isNdjson = true;
        return;
      }
      throw new NotNdjsonError('Dictionary download is not NDJSON');
    }
    if (!isNdjson) throw new NotNdjsonError('Dictionary download is not NDJSON');

    if (!meta) {
      meta = JSON.parse(line) as OfflineDictMeta;
      callbacks.onMeta?.(meta);
      return;
    }

    const row = JSON.parse(line) as [string, string, string | null, string];
    const entryJson = row[3];
    let alternate: string | null = null;
    // Only zh/yue carry a traditional-script alternate. Parsing every entry
    // just to extract it is pure overhead for the other ~60 languages.
    if (l2 === 'zh' || l2 === 'yue') {
      try {
        alternate = (JSON.parse(entryJson) as DictionaryEntry).alternate ?? null;
      } catch {
        // Corrupt entry — headword segmentation still works without alternate
      }
    }
    batch.push({
      id: row[0],
      head: row[1],
      alternate,
      pronunciation: row[2] ?? null,
      entry_json: entryJson,
    });
    processed++;

    if (batch.length >= ROW_BATCH_SIZE) {
      const rows = batch;
      batch = [];
      const total = meta.downloaded || meta.total || rows.length;
      await callbacks.onRows?.(rows, processed, total);
    }
  };

  try {
    // Peek at the first line to decide NDJSON vs JSON fallback.
    const firstChunk = handle.readBytes(READ_CHUNK_SIZE);
    if (!firstChunk || firstChunk.length === 0) {
      throw new Error('Dictionary download is empty');
    }
    pending += decoder.decode(firstChunk, { stream: true });
    const firstNewline = pending.indexOf('\n');
    if (firstNewline === -1 || pending.slice(0, firstNewline) !== NDJSON_MARKER) {
      throw new NotNdjsonError('Dictionary download is not NDJSON');
    }
    pending = pending.slice(firstNewline + 1);
    firstLine = false;
    isNdjson = true;

    while (true) {
      if (signal?.aborted) throw new Error('Download cancelled');
      const chunk = handle.readBytes(READ_CHUNK_SIZE);
      if (!chunk || chunk.length === 0) break;
      pending += decoder.decode(chunk, { stream: true });

      let newline: number;
      while ((newline = pending.indexOf('\n')) !== -1) {
        const line = pending.slice(0, newline);
        pending = pending.slice(newline + 1);
        await processLine(line);
        // Yield to the main thread so parsing never blocks the UI for long.
        if (processed % ROW_BATCH_SIZE === 0) {
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }
    }

    pending += decoder.decode();
    if (pending.length > 0) await processLine(pending);
    if (!meta) throw new Error('Dictionary download is missing metadata');
    await flushBatch();
    return meta;
  } finally {
    handle.close();
  }
}

/**
 * Download and parse the offline dictionary for a language.
 *
 * Rows are delivered through `callbacks.onRows` in batches so the caller can
 * stream them straight into SQLite. Resolves with the download metadata once
 * all rows have been parsed.
 */
export async function downloadDictionaryData(
  l2: string,
  l1: string,
  callbacks: DictionaryDownloadCallbacks = {},
  signal?: AbortSignal,
): Promise<OfflineDictMeta> {
  const url =
    `${PYTHON_API_URL}/dictionary/download` +
    `?l2=${encodeURIComponent(l2)}&l1=${encodeURIComponent(l1)}` +
    `&limit=125000&format=ndjson`;

  log('[DictDownload] 📥 downloading dictionary — l2:', l2, 'l1:', l1);
  let file: File | null = null;
  try {
    file = await downloadToCache(url, l2, callbacks.onDownloadProgress, signal);
    try {
      return await streamNdjson(file, callbacks, signal, l2);
    } catch (e) {
      if (!(e instanceof NotNdjsonError)) throw e;

      // Old server: fall back to the full JSON response.
      log('[DictDownload] ⚠️ server returned JSON — falling back to JSON parse');
      const text = await file.text();
      const data = JSON.parse(text) as DictionaryDownloadResponse;
      const meta: OfflineDictMeta = {
        total: data.total,
        freq_count: data.freq_count,
        downloaded: data.downloaded,
        capped: data.capped,
        version: data.version,
      };
      callbacks.onMeta?.(meta);

      const rows = rowsFromEntries(data);
      for (let i = 0; i < rows.length; i += ROW_BATCH_SIZE) {
        if (signal?.aborted) throw new Error('Download cancelled');
        const batch = rows.slice(i, i + ROW_BATCH_SIZE);
        const processed = Math.min(i + batch.length, rows.length);
        await callbacks.onRows?.(batch, processed, rows.length);
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      return meta;
    }
  } finally {
    if (file) {
      try {
        if (file.exists) file.delete();
      } catch {}
    }
  }
}

/**
 * Download a precompiled, gzipped SQLite dictionary (`?format=db`), decompress
 * it, and atomically replace the per-language dictionary file.
 *
 * Returns the metadata embedded in the DB's dict_meta table.
 */
export async function downloadPrecompiledDictionary(
  l2: string,
  l1: string,
  onDownloadProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<DictMeta> {
  const url =
    `${PYTHON_API_URL}/dictionary/download` +
    `?l2=${encodeURIComponent(l2)}&l1=${encodeURIComponent(l1)}` +
    `&limit=125000&format=db`;

  log('[DictDownload] 📦 downloading precompiled dictionary — l2:', l2, 'l1:', l1);
  const gzFile = await downloadToCache(url, l2, onDownloadProgress, signal);
  try {
    if (signal?.aborted) throw new Error('Download cancelled');
    const gzBytes = await gzFile.bytes();
    log('[DictDownload] downloaded gzip bytes:', gzBytes.length, '— l2:', l2);

    const { gunzipSync } = await import('fflate');
    const dbBytes = gunzipSync(gzBytes);
    log('[DictDownload] decompressed db bytes:', dbBytes.length, '— l2:', l2);

    return await savePrecompiledDictionary(l2, dbBytes);
  } finally {
    try {
      if (gzFile.exists) gzFile.delete();
    } catch {}
  }
}
