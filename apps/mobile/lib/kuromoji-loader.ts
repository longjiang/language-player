/**
 * React Native-compatible kuromoji dictionary loader.
 *
 * kuromoji is a pure-JS Japanese morphological analyzer that handles
 * both segmentation and lemmatization in one call. Its dictionary
 * files (.dat.gz) are downloaded as a data pack and stored on the
 * device filesystem under {documentDirectory}/tokenizers/ja/.
 *
 * This module provides:
 *   1. Custom RN loader that reads .dat.gz from device filesystem
 *      using expo-file-system (instead of XHR in the browser build).
 *   2. Full dictionary loading: reads 17 .dat.gz files in parallel,
 *      decompresses with pako, populates DynamicDictionaries, and
 *      returns a configured kuromoji Tokenizer.
 *
 * See SPEC-018 Phase 2c and ARCH-018 (Category A: Japanese) for details.
 *
 * @module kuromoji-loader
 */

import { File } from 'expo-file-system';
import pako from 'pako';

// ── Dictionary file inventory ───────────────────────────────────────
// These are the .dat.gz files that kuromoji's IPADIC dictionary needs.
// Same files as loaded by DictionaryLoader.load() in kuromoji.

const TRIE_FILES = ['base.dat.gz', 'check.dat.gz'];
const TOKEN_INFO_FILES = ['tid.dat.gz', 'tid_pos.dat.gz', 'tid_map.dat.gz'];
const CC_FILE = 'cc.dat.gz';
const UNK_FILES = [
  'unk.dat.gz',
  'unk_pos.dat.gz',
  'unk_map.dat.gz',
  'unk_char.dat.gz',
  'unk_compat.dat.gz',
  'unk_invoke.dat.gz',
];

/** All dictionary files loaded by kuromoji. */
const ALL_DICT_FILES = [
  ...TRIE_FILES,
  ...TOKEN_INFO_FILES,
  CC_FILE,
  ...UNK_FILES,
];

// ── File reading helpers ────────────────────────────────────────────

/**
 * Read a single .dat.gz file from the device filesystem and decompress it.
 *
 * Steps:
 *   1. Read the file as base64 (expo-file-system's binary read format)
 *   2. Decode base64 → Uint8Array
 *   3. Decompress gzip → decompressed ArrayBuffer
 *
 * The decompressed buffer is a binary IPADIC dictionary that kuromoji's
 * DynamicDictionaries methods parse via TypedArray views.
 */
async function readAndDecompress(
  dicPath: string,
  filename: string,
): Promise<ArrayBuffer> {
  const uri = `${dicPath}${filename}`;
  const compressed = await new File(uri).bytes();

  // Gzip decompression using pako (pure JS, works in RN)
  // Safe slice: pako's Uint8Array may be a view over a larger buffer,
  // and TypedArray constructors (Int32Array, etc.) use the full .buffer.
  const decompressed = pako.ungzip(compressed);
  return decompressed.buffer.slice(
    decompressed.byteOffset,
    decompressed.byteOffset + decompressed.byteLength,
  );
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Check whether all kuromoji dictionary files exist on the device.
 *
 * @param dicPath - Path to the kuromoji dictionary directory
 *   (e.g., FileSystem.documentDirectory + 'tokenizers/ja/')
 * @returns true if all expected files exist
 */
export async function hasKuromojiFiles(dicPath: string): Promise<boolean> {
  try {
    return ALL_DICT_FILES.every((f) => new File(`${dicPath}${f}`).exists);
  } catch {
    return false;
  }
}

/**
 * Load kuromoji dictionary files and create a configured Tokenizer.
 *
 * Reads all 17 .dat.gz files from the device filesystem, decompresses
 * them, populates DynamicDictionaries, and returns a ready-to-use
 * kuromoji Tokenizer instance.
 *
 * @param dicPath - Path to the directory containing .dat.gz files
 * @returns A kuromoji Tokenizer instance
 * @throws If any dictionary file is missing, unreadable, or corrupt
 */
export async function loadKuromoji(dicPath: string): Promise<any> {
  // Load all dictionary files in parallel for maximum throughput
  const [
    [baseBuf, checkBuf],
    [tidBuf, tidPosBuf, tidMapBuf],
    ccBuf,
    [unkBuf, unkPosBuf, unkMapBuf, unkCharBuf, unkCompatBuf, unkInvokeBuf],
  ] = await Promise.all([
    Promise.all(TRIE_FILES.map((f) => readAndDecompress(dicPath, f))),
    Promise.all(TOKEN_INFO_FILES.map((f) => readAndDecompress(dicPath, f))),
    readAndDecompress(dicPath, CC_FILE),
    Promise.all(UNK_FILES.map((f) => readAndDecompress(dicPath, f))),
  ]);

  // Dynamic require of kuromoji internal classes (CommonJS modules).
  // ⚠️ Fragile: kuromoji (unmaintained, last published 2018) does not
  //    expose src/ in its package.json exports map. These deep imports
  //    work with Metro bundler's resolution but may break on kuromoji
  //    version bumps or Metro config changes. Consider vendoring the
  //    two needed files if this becomes a recurring issue.
  // @ts-ignore - kuromoji is a CJS module without TS types
  const DynamicDictionaries = (await import('kuromoji/src/dict/DynamicDictionaries')).default;
  // @ts-ignore - kuromoji is a CJS module without TS types
  const Tokenizer = (await import('kuromoji/src/Tokenizer')).default;

  // Create a fresh DynamicDictionaries and populate it
  const dic = new DynamicDictionaries();

  // 1. Trie (double-array): base.dat.gz + check.dat.gz → Int32Array
  dic.loadTrie(new Int32Array(baseBuf), new Int32Array(checkBuf));

  // 2. Token info dictionaries: tid.dat.gz, tid_pos.dat.gz, tid_map.dat.gz → Uint8Array
  dic.loadTokenInfoDictionaries(
    new Uint8Array(tidBuf),
    new Uint8Array(tidPosBuf),
    new Uint8Array(tidMapBuf),
  );

  // 3. Connection cost matrix: cc.dat.gz → Int16Array
  dic.loadConnectionCosts(new Int16Array(ccBuf));

  // 4. Unknown word dictionaries: → Uint8Array/Uint32Array
  //    unk_char.dat.gz → Uint8Array (character category map)
  //    unk_compat.dat.gz → Uint32Array (compatible category map)
  //    All others → Uint8Array
  dic.loadUnknownDictionaries(
    new Uint8Array(unkBuf),
    new Uint8Array(unkPosBuf),
    new Uint8Array(unkMapBuf),
    new Uint8Array(unkCharBuf),
    new Uint32Array(unkCompatBuf),
    new Uint8Array(unkInvokeBuf),
  );

  // Create and return the Tokenizer
  return new Tokenizer(dic);
}
