/**
 * React Native-compatible kuromoji-ko (Korean) dictionary loader.
 *
 * kuromoji-ko is a pure-TS Korean morphological analyzer based on kuromoji.js
 * and mecab-ko-dic. It handles both segmentation and lemmatization in one
 * call. Dictionary files (.dat.gz) are downloaded as a data pack and stored
 * on the device filesystem under {documentDirectory}/tokenizers/ko/.
 *
 * Unlike the original kuromoji (Japanese) which ships individual source files
 * that can be deep-imported, kuromoji-ko is tsup-bundled into a single
 * dist/index.js with internal classes in module-private scope. This module
 * therefore provides inline shim implementations of the required internal
 * classes (ByteBuffer, TokenInfoDictionary, ConnectionCosts, CharacterDef,
 * UnknownDictionary, DynamicDictionaries) that exactly match the APIs that
 * kuromoji-ko's Tokenizer expects.
 *
 * The shim classes mirror the source at:
 *   node_modules/kuromoji-ko/dist/index.js
 *
 * See SPEC-018 Phase 2d and ARCH-018 (Category A: Korean) for details.
 *
 * @module kuromoji-ko-loader
 */

import * as FileSystem from 'expo-file-system/legacy';
import pako from 'pako';
// @ts-ignore – doublearray has no type declarations, used only at runtime
import doublearray from 'doublearray';

// ── Dictionary file inventory ───────────────────────────────────────
// Same .dat.gz file layout as kuromoji (mecab-ko-dic binary format).

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

/** All dictionary files loaded by kuromoji-ko. */
const ALL_DICT_FILES = [
  ...TRIE_FILES,
  ...TOKEN_INFO_FILES,
  CC_FILE,
  ...UNK_FILES,
];

// ── UTF-8 helpers ───────────────────────────────────────────────────

/** Encode a JS string to UTF-8 bytes. Matches kuromoji-ko's stringToUtf8Bytes. */
function stringToUtf8Bytes(str: string): Uint8Array {
  const bytes = new Uint8Array(str.length * 4);
  let i = 0;
  let j = 0;
  while (i < str.length) {
    let unicodeCode: number;
    const utf16Code = str.charCodeAt(i++);
    if (utf16Code >= 0xd800 && utf16Code <= 0xdbff) {
      const upper = utf16Code;
      const lower = str.charCodeAt(i++);
      if (lower >= 0xdc00 && lower <= 0xdfff) {
        unicodeCode = (upper - 0xd800) * (1 << 10) + (1 << 16) + (lower - 0xdc00);
      } else {
        throw new Error('Malformed surrogate pair');
      }
    } else {
      unicodeCode = utf16Code;
    }
    if (unicodeCode <= 0x7f) {
      bytes[j++] = unicodeCode;
    } else if (unicodeCode <= 0x7ff) {
      bytes[j++] = 0xc0 | (unicodeCode >> 6);
      bytes[j++] = 0x80 | (unicodeCode & 0x3f);
    } else if (unicodeCode <= 0xffff) {
      bytes[j++] = 0xe0 | (unicodeCode >> 12);
      bytes[j++] = 0x80 | ((unicodeCode >> 6) & 0x3f);
      bytes[j++] = 0x80 | (unicodeCode & 0x3f);
    } else {
      bytes[j++] = 0xf0 | (unicodeCode >> 18);
      bytes[j++] = 0x80 | ((unicodeCode >> 12) & 0x3f);
      bytes[j++] = 0x80 | ((unicodeCode >> 6) & 0x3f);
      bytes[j++] = 0x80 | (unicodeCode & 0x3f);
    }
  }
  return bytes.subarray(0, j);
}

/** Decode UTF-8 byte array to JS string. Matches kuromoji-ko's utf8BytesToString. */
function utf8BytesToString(bytes: number[]): string {
  let result = '';
  let i = 0;
  while (i < bytes.length) {
    const b0 = bytes[i++];
    if (b0 < 0x80) {
      result += String.fromCodePoint(b0);
    } else if (b0 >> 5 === 0x06) {
      const b1 = bytes[i++];
      result += String.fromCodePoint(((b0 & 0x1f) << 6) | (b1 & 0x3f));
    } else if (b0 >> 4 === 0x0e) {
      const b1 = bytes[i++];
      const b2 = bytes[i++];
      result += String.fromCodePoint(
        ((b0 & 0x0f) << 12) | ((b1 & 0x3f) << 6) | (b2 & 0x3f),
      );
    } else {
      const b1 = bytes[i++];
      const b2 = bytes[i++];
      const b3 = bytes[i++];
      result += String.fromCodePoint(
        ((b0 & 0x07) << 18) |
          ((b1 & 0x3f) << 12) |
          ((b2 & 0x3f) << 6) |
          (b3 & 0x3f),
      );
    }
  }
  return result;
}

// ── ByteBuffer ──────────────────────────────────────────────────────
// Matches kuromoji-ko's ByteBuffer class exactly.

class ByteBuffer {
  buffer: Uint8Array;
  position: number;

  constructor(arg?: Uint8Array | ArrayBuffer | number | null) {
    if (arg == null) {
      this.buffer = new Uint8Array(1024 * 1024);
      this.position = 0;
    } else if (typeof arg === 'number') {
      this.buffer = new Uint8Array(arg);
      this.position = 0;
    } else if (arg instanceof Uint8Array) {
      this.buffer = arg;
      this.position = 0;
    } else if (arg instanceof ArrayBuffer) {
      this.buffer = new Uint8Array(arg);
      this.position = 0;
    } else {
      throw new Error('Invalid parameter type for ByteBuffer constructor');
    }
  }

  size(): number {
    return this.buffer.length;
  }

  reallocate(): void {
    const newArray = new Uint8Array(this.buffer.length * 2);
    newArray.set(this.buffer);
    this.buffer = newArray;
  }

  shrink(): Uint8Array {
    this.buffer = this.buffer.subarray(0, this.position);
    return this.buffer;
  }

  put(b: number): void {
    if (this.buffer.length < this.position + 1) {
      this.reallocate();
    }
    this.buffer[this.position++] = b;
  }

  get(index?: number): number {
    if (index == null) {
      index = this.position;
      this.position += 1;
    }
    if (this.buffer.length < index + 1) {
      return 0;
    }
    return this.buffer[index];
  }

  putShort(num: number): void {
    if (65535 < num) {
      throw new Error(`${num} is over short value`);
    }
    const lower = 255 & num;
    const upper = (65280 & num) >> 8;
    this.put(lower);
    this.put(upper);
  }

  getShort(index?: number): number {
    if (index == null) {
      index = this.position;
      this.position += 2;
    }
    if (this.buffer.length < index + 2) {
      return 0;
    }
    const lower = this.buffer[index];
    const upper = this.buffer[index + 1];
    let value = (upper << 8) + lower;
    if (value & 32768) {
      value = -(value - 1 ^ 65535);
    }
    return value;
  }

  putInt(num: number): void {
    if (4294967295 < num) {
      throw new Error(`${num} is over integer value`);
    }
    const b0 = 255 & num;
    const b1 = (65280 & num) >> 8;
    const b2 = (16711680 & num) >> 16;
    const b3 = (4278190080 & num) >> 24;
    this.put(b0);
    this.put(b1);
    this.put(b2);
    this.put(b3);
  }

  getInt(index?: number): number {
    if (index == null) {
      index = this.position;
      this.position += 4;
    }
    if (this.buffer.length < index + 4) {
      return 0;
    }
    const b0 = this.buffer[index];
    const b1 = this.buffer[index + 1];
    const b2 = this.buffer[index + 2];
    const b3 = this.buffer[index + 3];
    return (b3 << 24 >>> 0) + (b2 << 16) + (b1 << 8) + b0;
  }

  readInt(): number {
    const pos = this.position;
    this.position += 4;
    return this.getInt(pos);
  }

  putString(str: string): void {
    const bytes = stringToUtf8Bytes(str);
    for (let i = 0; i < bytes.length; i++) {
      this.put(bytes[i]);
    }
    this.put(0);
  }

  getString(index?: number): string {
    const buf: number[] = [];
    if (index == null) {
      index = this.position;
    }
    while (true) {
      if (this.buffer.length < index + 1) {
        break;
      }
      const ch = this.get(index++);
      if (ch === 0) {
        break;
      } else {
        buf.push(ch);
      }
    }
    this.position = index;
    return utf8BytesToString(buf);
  }
}

// ── TokenInfoDictionary ─────────────────────────────────────────────
// Stores word entry data: left_id, right_id, word_cost + feature string.
// Data is loaded from tid.dat.gz (binary), tid_pos.dat.gz (POS vectors),
// and tid_map.dat.gz (mapping: trie_id → [tokenInfoId, ...]).
//
// Implements the full API that kuromoji-ko's Tokenizer/ViterbiBuilder expects.
// `buildDictionary`/`put`/`targetMapToBuffer` are used only during dictionary
// BUILDING (not tokenization); stubs are provided for type compatibility.

class TokenInfoDictionary {
  /** Stub — used during dictionary building, not for loaded dicts. */
  buildDictionary(_entries: any[]): Record<number, string> { return {}; }
  /** Stub — used during dictionary building, not for loaded dicts. */
  put(_leftId: number, _rightId: number, _wordCost: number, _surfaceForm: string, _feature: string): number { return 0; }
  /** Stub — used during dictionary building, not for loaded dicts. */
  targetMapToBuffer(): Uint8Array { return new Uint8Array(); }
  dictionary: ByteBuffer;
  targetMap: Record<number, number[]>;
  posBuffer: ByteBuffer;

  constructor() {
    this.dictionary = new ByteBuffer(10 * 1024 * 1024);
    this.targetMap = {};
    this.posBuffer = new ByteBuffer(10 * 1024 * 1024);
  }

  loadDictionary(arrayBuffer: ArrayBuffer | Uint8Array): this {
    this.dictionary = new ByteBuffer(
      arrayBuffer instanceof Uint8Array ? arrayBuffer : new Uint8Array(arrayBuffer),
    );
    return this;
  }

  loadPosVector(arrayBuffer: ArrayBuffer | Uint8Array): this {
    this.posBuffer = new ByteBuffer(
      arrayBuffer instanceof Uint8Array ? arrayBuffer : new Uint8Array(arrayBuffer),
    );
    return this;
  }

  loadTargetMap(arrayBuffer: ArrayBuffer | Uint8Array): this {
    const buffer = new ByteBuffer(
      arrayBuffer instanceof Uint8Array ? arrayBuffer : new Uint8Array(arrayBuffer),
    );
    buffer.position = 0;
    this.targetMap = {};
    buffer.readInt(); // skip mapKeysSize
    while (true) {
      if (buffer.buffer.length < buffer.position + 1) {
        break;
      }
      const key = buffer.readInt();
      const mapValuesSize = buffer.readInt();
      for (let i = 0; i < mapValuesSize; i++) {
        const value = buffer.readInt();
        this.addMapping(key, value);
      }
    }
    return this;
  }

  addMapping(source: number, target: number): void {
    let mapping = this.targetMap[source];
    if (mapping == null) {
      mapping = [];
    }
    mapping.push(target);
    this.targetMap[source] = mapping;
  }

  getFeatures(tokenInfoIdStr: string | number): string {
    const tokenInfoId =
      typeof tokenInfoIdStr === 'string' ? parseInt(tokenInfoIdStr, 10) : tokenInfoIdStr;
    if (isNaN(tokenInfoId)) {
      return '';
    }
    const posId = this.dictionary.getInt(tokenInfoId + 6);
    return this.posBuffer.getString(posId);
  }
}

// ── ConnectionCosts ─────────────────────────────────────────────────
// Matrix of transition costs between left_id and right_id.
// Loaded from cc.dat.gz.

class ConnectionCosts {
  forwardDimension: number;
  backwardDimension: number;
  buffer: Int16Array;

  constructor(forwardDimension: number, backwardDimension: number) {
    this.forwardDimension = forwardDimension;
    this.backwardDimension = backwardDimension;
    this.buffer = new Int16Array(forwardDimension * backwardDimension + 2);
    this.buffer[0] = forwardDimension;
    this.buffer[1] = backwardDimension;
  }

  /** Stub — used during dictionary building, not for loaded dicts. */
  put(_forwardId: number, _backwardId: number, _cost: number): void {
    // No-op for pre-built dictionaries
  }

  get(forwardId: number, backwardId: number): number {
    const index = forwardId * this.backwardDimension + backwardId + 2;
    if (this.buffer.length < index + 1) {
      throw new Error('ConnectionCosts buffer overflow');
    }
    return this.buffer[index];
  }

  loadConnectionCosts(connectionCostsBuffer: Int16Array): void {
    this.forwardDimension = connectionCostsBuffer[0];
    this.backwardDimension = connectionCostsBuffer[1];
    this.buffer = connectionCostsBuffer;
  }
}

// ── CharacterClass ──────────────────────────────────────────────────
// Defines a character category (e.g., DEFAULT, HANGUL, KANJI).

class CharacterClass {
  class_id: number;
  class_name: string;
  is_always_invoke: boolean;
  is_grouping: boolean;
  max_length: number;

  constructor(
    classId: number,
    className: string,
    isAlwaysInvoke: boolean,
    isGrouping: boolean,
    maxLength: number,
  ) {
    this.class_id = classId;
    this.class_name = className;
    this.is_always_invoke = isAlwaysInvoke;
    this.is_grouping = isGrouping;
    this.max_length = maxLength;
  }
}

// ── InvokeDefinitionMap ─────────────────────────────────────────────
// Stores character class definitions. Loaded from unk_invoke.dat.gz.

class InvokeDefinitionMap {
  map: CharacterClass[];
  lookupTable: Record<string, number>;

  constructor() {
    this.map = [];
    this.lookupTable = {};
  }

  static load(invokeDefBuffer: ArrayBuffer | Uint8Array): InvokeDefinitionMap {
    const invokeDef = new InvokeDefinitionMap();
    const characterCategoryDefinition: CharacterClass[] = [];
    const buffer = new ByteBuffer(
      invokeDefBuffer instanceof Uint8Array ? invokeDefBuffer : new Uint8Array(invokeDefBuffer),
    );
    while (buffer.position + 1 < buffer.size()) {
      const classId = characterCategoryDefinition.length;
      const isAlwaysInvoke = buffer.get();
      const isGrouping = buffer.get();
      const maxLength = buffer.getInt();
      const className = buffer.getString();
      characterCategoryDefinition.push(
        new CharacterClass(classId, className, isAlwaysInvoke !== 0, isGrouping !== 0, maxLength),
      );
    }
    invokeDef.init(characterCategoryDefinition);
    return invokeDef;
  }

  init(characterCategoryDefinition: CharacterClass[]): void {
    if (characterCategoryDefinition == null) return;
    for (let i = 0; i < characterCategoryDefinition.length; i++) {
      const characterClass = characterCategoryDefinition[i];
      this.map[i] = characterClass;
      this.lookupTable[characterClass.class_name] = i;
    }
  }

  getCharacterClass(classId: number): CharacterClass | undefined {
    return this.map[classId];
  }

  lookup(className: string): number | null {
    const classId = this.lookupTable[className];
    if (classId == null) return null;
    return classId;
  }
}

// ── CharacterDefinition ─────────────────────────────────────────────
// Maps characters to character classes for unknown word handling.
// Loaded from unk_char.dat.gz + unk_compat.dat.gz + unk_invoke.dat.gz.

const DEFAULT_CATEGORY = 'DEFAULT';

class CharacterDefinition {
  characterCategoryMap: Uint8Array;
  compatibleCategoryMap: Uint32Array;
  invokeDefinitionMap: InvokeDefinitionMap | null;

  constructor() {
    this.characterCategoryMap = new Uint8Array(65536);
    this.compatibleCategoryMap = new Uint32Array(65536);
    this.invokeDefinitionMap = null;
  }

  /** Stub — used during dictionary building, not for loaded dicts. */
  initCategoryMappings(_categoryMapping: any[] | null): void {
    // No-op for pre-built dictionaries
  }

  static load(
    catMapBuffer: ArrayBuffer | Uint8Array,
    compatCatMapBuffer: ArrayBuffer | Uint32Array,
    invokeDefBuffer: ArrayBuffer | Uint8Array,
  ): CharacterDefinition {
    const charDef = new CharacterDefinition();
    charDef.characterCategoryMap = catMapBuffer instanceof Uint8Array ? catMapBuffer : new Uint8Array(catMapBuffer);
    charDef.compatibleCategoryMap = compatCatMapBuffer instanceof Uint32Array ? compatCatMapBuffer : new Uint32Array(compatCatMapBuffer);
    charDef.invokeDefinitionMap = InvokeDefinitionMap.load(invokeDefBuffer);
    return charDef;
  }

  lookup(ch: string): CharacterClass | undefined {
    let classId: number | null = null;
    const code = ch.charCodeAt(0);
    // Check for surrogate pair
    if (code >= 0xd800 && code <= 0xdbff && ch.length > 1) {
      classId = this.invokeDefinitionMap?.lookup(DEFAULT_CATEGORY) ?? null;
    } else if (code < this.characterCategoryMap.length) {
      classId = this.characterCategoryMap[code];
    }
    if (classId == null) {
      classId = this.invokeDefinitionMap?.lookup(DEFAULT_CATEGORY) ?? null;
    }
    if (classId == null) return undefined;
    return this.invokeDefinitionMap?.getCharacterClass(classId);
  }

  lookupCompatibleCategory(ch: string): CharacterClass[] {
    const classes: CharacterClass[] = [];
    const code = ch.charCodeAt(0);
    let integer: number | undefined;
    if (code < this.compatibleCategoryMap.length) {
      integer = this.compatibleCategoryMap[code];
    }
    if (integer == null || integer === 0) return classes;
    for (let bit = 0; bit < 32; bit++) {
      if (((integer << (31 - bit)) >>> 31) === 1) {
        const characterClass = this.invokeDefinitionMap?.getCharacterClass(bit);
        if (characterClass == null) continue;
        classes.push(characterClass);
      }
    }
    return classes;
  }
}

// ── UnknownDictionary ───────────────────────────────────────────────
// Extends TokenInfoDictionary with character definition for unknown words.
// Loaded from unk.dat.gz + unk_pos.dat.gz + unk_map.dat.gz + character defs.

class UnknownDictionary extends TokenInfoDictionary {
  characterDefinition: CharacterDefinition | null;

  constructor() {
    super();
    this.characterDefinition = null;
  }

  lookup(ch: string): CharacterClass | undefined {
    return this.characterDefinition?.lookup(ch);
  }

  lookupCompatibleCategory(ch: string): CharacterClass[] {
    return this.characterDefinition?.lookupCompatibleCategory(ch) ?? [];
  }

  /** Stub — set by loadUnknownDictionaries internally. */
  setCharacterDefinition(_characterDefinition: CharacterDefinition): this {
    this.characterDefinition = _characterDefinition;
    return this;
  }

  loadUnknownDictionaries(
    unkBuffer: ArrayBuffer | Uint8Array,
    unkPosBuffer: ArrayBuffer | Uint8Array,
    unkMapBuffer: ArrayBuffer | Uint8Array,
    catMapBuffer: ArrayBuffer | Uint8Array,
    compatCatMapBuffer: ArrayBuffer | Uint32Array,
    invokeDefBuffer: ArrayBuffer | Uint8Array,
  ): void {
    this.loadDictionary(unkBuffer);
    this.loadPosVector(unkPosBuffer);
    this.loadTargetMap(unkMapBuffer);
    this.characterDefinition = CharacterDefinition.load(
      catMapBuffer,
      compatCatMapBuffer as ArrayBuffer | Uint32Array,
      invokeDefBuffer,
    );
  }
}

// ── DynamicDictionaries ─────────────────────────────────────────────
// Container for all dictionary components. Mirrors kuromoji-ko's
// DynamicDictionaries class exactly.

class DynamicDictionaries {
  trie: any;
  tokenInfoDictionary: TokenInfoDictionary;
  connectionCosts: ConnectionCosts;
  unknownDictionary: UnknownDictionary;

  constructor(
    trie?: any,
    tokenInfoDictionary?: TokenInfoDictionary,
    connectionCosts?: ConnectionCosts,
    unknownDictionary?: UnknownDictionary,
  ) {
    this.trie = trie ?? { commonPrefixSearch: () => [] };
    this.tokenInfoDictionary = tokenInfoDictionary ?? new TokenInfoDictionary();
    this.connectionCosts = connectionCosts ?? new ConnectionCosts(0, 0);
    this.unknownDictionary = unknownDictionary ?? new UnknownDictionary();
  }

  async loadTrie(baseBuffer: ArrayBuffer | Int32Array, checkBuffer: ArrayBuffer | Int32Array): Promise<this> {
    this.trie = doublearray.load(baseBuffer, checkBuffer);
    return this;
  }

  loadTokenInfoDictionaries(
    tokenInfoBuffer: ArrayBuffer | Uint8Array,
    posBuffer: ArrayBuffer | Uint8Array,
    targetMapBuffer: ArrayBuffer | Uint8Array,
  ): this {
    this.tokenInfoDictionary.loadDictionary(tokenInfoBuffer);
    this.tokenInfoDictionary.loadPosVector(posBuffer);
    this.tokenInfoDictionary.loadTargetMap(targetMapBuffer);
    return this;
  }

  loadConnectionCosts(ccBuffer: Int16Array): this {
    this.connectionCosts.loadConnectionCosts(ccBuffer);
    return this;
  }

  loadUnknownDictionaries(
    unkBuffer: ArrayBuffer | Uint8Array,
    unkPosBuffer: ArrayBuffer | Uint8Array,
    unkMapBuffer: ArrayBuffer | Uint8Array,
    catMapBuffer: ArrayBuffer | Uint8Array,
    compatCatMapBuffer: ArrayBuffer | Uint32Array | Uint8Array,
    invokeDefBuffer: ArrayBuffer | Uint8Array,
  ): this {
    this.unknownDictionary.loadUnknownDictionaries(
      unkBuffer,
      unkPosBuffer,
      unkMapBuffer,
      catMapBuffer,
      compatCatMapBuffer as ArrayBuffer | Uint32Array,
      invokeDefBuffer,
    );
    return this;
  }
}

// ── File reading helpers ────────────────────────────────────────────

/**
 * Read a single .dat.gz file from the device filesystem and decompress it.
 *
 * Steps:
 *   1. Read the file as base64 (expo-file-system's binary read format)
 *   2. Decode base64 → Uint8Array
 *   3. Decompress gzip → decompressed ArrayBuffer
 */
async function readAndDecompress(dicPath: string, filename: string): Promise<ArrayBuffer> {
  const uri = `${dicPath}${filename}`;
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  // Base64 → binary string → Uint8Array
  const binaryStr = atob(base64);
  const compressed = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    compressed[i] = binaryStr.charCodeAt(i);
  }

  // Gzip decompression using pako (pure JS, works in RN)
  return pako.ungzip(compressed).buffer as ArrayBuffer;
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Check whether all kuromoji-ko dictionary files exist on the device.
 *
 * @param dicPath - Path to the dictionary directory
 *   (e.g., FileSystem.documentDirectory + 'tokenizers/ko/')
 * @returns true if all expected files exist
 */
export async function hasKuromojiKoFiles(dicPath: string): Promise<boolean> {
  try {
    const results = await Promise.all(
      ALL_DICT_FILES.map((f) =>
        FileSystem.getInfoAsync(`${dicPath}${f}`).then((r) => r.exists),
      ),
    );
    return results.every(Boolean);
  } catch {
    return false;
  }
}

/**
 * Load kuromoji-ko dictionary files and create a configured Tokenizer.
 *
 * Reads all .dat.gz files from the device filesystem, decompresses them,
 * populates DynamicDictionaries, and returns a ready-to-use kuromoji-ko
 * Tokenizer instance.
 *
 * @param dicPath - Path to the directory containing .dat.gz files
 * @returns A kuromoji-ko Tokenizer instance
 * @throws If any dictionary file is missing, unreadable, or corrupt
 */
export async function loadKuromojiKo(dicPath: string): Promise<any> {
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

  // Import the kuromoji-ko Tokenizer from the published API
  // @ts-ignore - kuromoji-ko is an ESM package, works with Metro bundler
  const { Tokenizer } = await import('kuromoji-ko');

  // Create DynamicDictionaries and populate it with the loaded data
  const dic = new DynamicDictionaries();

  // 1. Trie (double-array): base.dat.gz + check.dat.gz → Int32Array
  await dic.loadTrie(
    new Int32Array(baseBuf),
    new Int32Array(checkBuf),
  );

  // 2. Token info dictionaries: tid.dat.gz, tid_pos.dat.gz, tid_map.dat.gz → Uint8Array
  dic.loadTokenInfoDictionaries(
    new Uint8Array(tidBuf),
    new Uint8Array(tidPosBuf),
    new Uint8Array(tidMapBuf),
  );

  // 3. Connection cost matrix: cc.dat.gz → Int16Array
  dic.loadConnectionCosts(new Int16Array(ccBuf));

  // 4. Unknown word dictionaries
  dic.loadUnknownDictionaries(
    new Uint8Array(unkBuf),
    new Uint8Array(unkPosBuf),
    new Uint8Array(unkMapBuf),
    new Uint8Array(unkCharBuf),
    new Uint32Array(unkCompatBuf),
    new Uint8Array(unkInvokeBuf),
  );

  // Create and return the Tokenizer
  // Cast through `any` — our DynamicDictionaries shim is structurally
  // compatible for tokenization but TypeScript sees it as a different
  // type from kuromoji-ko's exported DynamicDictionaries (internal
  // classes are reimplemented, not imported).
  return new Tokenizer(dic as any);
}
