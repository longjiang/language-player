/**
 * Hidden-WebView tokenizer worker bridge (SPEC-018 performance).
 *
 * TokenizationHost loads kuromoji the way the docs describe — the official
 * browser UMD build in a <script> tag — and builds the tokenizer from the
 * on-device data pack (streamed in as base64 chunks, served to the builder
 * through an in-memory XHR shim). This module:
 *   - warms the tokenizer once at app launch,
 *   - tokenizes Japanese lines off the RN JS thread,
 *   - maps kuromoji tokens to the app's LemmatizedToken shape.
 * The main-thread tokenizer remains the fallback whenever the worker is
 * unavailable or fails. Works fully offline — only local files are read.
 */

import type { WebView } from 'react-native-webview';
import { File } from 'expo-file-system';
import { KROMOJI_DICT_FILES, getKuromojiDataPath, hasKuromojiData } from '@/lib/tokenizer-db';
import type { LemmatizedToken } from '@langplayer/shared';
import { cleanPronunciation } from '@langplayer/utils';
import { tokenizerLogger } from '@/lib/logger';
import { cleanJapaneseLemma } from '@/lib/japanese-lemma';

const { log, logwarn } = tokenizerLogger;

type WorkerStatus = 'idle' | 'loading' | 'ready' | 'failed';

/** A kuromoji-shaped token as produced by the WebView page. */
interface WorkerToken {
  surface_form: string;
  basic_form?: string;
  reading?: string;
  pronunciation?: string;
  pos?: string;
}

let webViewRef: WebView | null = null;
let status: WorkerStatus = 'idle';
let seq = 0;
let initTimer: ReturnType<typeof setTimeout> | null = null;
let warmResolve: ((ok: boolean) => void) | null = null;
let warmPromise: Promise<boolean> | null = null;
const pending = new Map<
  string,
  { resolve: (tokens: LemmatizedToken[] | null) => void; timer: ReturnType<typeof setTimeout> }
>();
/** Dict-based segmentation datasets (Chinese + SEA), keyed by L2. */
const dictStatus = new Map<string, WorkerStatus>();
const dictWarmPromises = new Map<string, Promise<boolean>>();
const dictWarmResolvers = new Map<string, (ok: boolean) => void>();
const dictInitTimers = new Map<string, ReturnType<typeof setTimeout>>();
const dictChunkAcks = new Map<string, Set<number>>();
const dictChunkTotal = new Map<string, number>();
const dictInitRetried = new Set<string>();

const CHUNK_BYTES = 128 * 1024;
/** Dict chunks are base64'd before injection (ASCII, proven with kuromoji),
 *  so 96 KB raw → ~128 KB base64 per call. */
const DICT_CHUNK_BYTES = 96 * 1024;
const INIT_TIMEOUT_MS = 30000;
const TOKENIZE_TIMEOUT_MS = 3000;
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function attachTokenizationWebView(ref: WebView | null): void {
  if (ref === null && webViewRef !== null) {
    // Host unmounted (reload/remount): drop stale state so the next host
    // re-warms its own WebView from scratch.
    status = 'idle';
    warmPromise = null;
    warmResolve = null;
  }
  webViewRef = ref;
}

export function isTokenizationWorkerReady(): boolean {
  return status === 'ready';
}

export function getTokenizationWorkerStatus(): WorkerStatus {
  return status;
}

function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]!;
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += B64[b0 >> 2]!;
    out += B64[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)]!;
    out += b1 === undefined ? '=' : B64[((b1 & 15) << 2) | ((b2 ?? 0) >> 6)]!;
    out += b2 === undefined ? '=' : B64[b2 & 63]!;
  }
  return out;
}

function inject(code: string): void {
  webViewRef?.injectJavaScript(`${code}; true;`);
}

/**
 * Serialized injection queue. WKWebView can drop evaluateJavaScript calls when
 * multiple async loops inject concurrently (observed: ja + dict warm storms),
 * so every warm loop chains its injections through this promise.
 */
let injectChain: Promise<void> = Promise.resolve();
function injectQueued(code: string): Promise<void> {
  injectChain = injectChain.then(async () => {
    inject(code);
    // Let the native bridge drain between large injections.
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return injectChain;
}

/**
 * Build a pure-ASCII JS string literal for `code`. WKWebView's
 * injectJavaScript drops/corrupts non-ASCII text (observed with Japanese and
 * Chinese), so every non-ASCII char is emitted as a \uXXXX escape — the
 * injected source stays ASCII and decodes to the exact original string.
 */
function toJsLiteral(s: string): string {
  let out = '';
  for (const ch of s) {
    const code = ch.codePointAt(0)!;
    if (ch === '"') out += '\\"';
    else if (ch === '\\') out += '\\\\';
    else if (code < 0x20) out += `\\u${code.toString(16).padStart(4, '0')}`;
    else if (code < 0x80) out += ch;
    else if (code <= 0xFFFF) out += `\\u${code.toString(16).padStart(4, '0')}`;
    else {
      const hi = 0xD800 + ((code - 0x10000) >> 10);
      const lo = 0xDC00 + ((code - 0x10000) & 0x3FF);
      out += `\\u${hi.toString(16).padStart(4, '0')}\\u${lo.toString(16).padStart(4, '0')}`;
    }
  }
  return out;
}

/** Resolve the promise, but give up after ms and return false. */
function waitWithTimeout(p: Promise<boolean>, ms: number): Promise<boolean> {
  return Promise.race([
    p,
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), ms)),
  ]);
}

/** Map a kuromoji token to the app's LemmatizedToken (mirrors tokenizeJapanese). */
function toLemmatized(t: WorkerToken): LemmatizedToken {
  return {
    text: t.surface_form,
    lemmas: [{
      lemma: cleanJapaneseLemma(t.surface_form, t.basic_form),
      part_of_speech: t.pos || undefined,
    }],
    ...(t.reading ? { pronunciation: t.reading } : {}),
    source: 'ja-kuromoji' as const,
  };
}

function markFailed(reason: string): void {
  if (status === 'failed') return;
  status = 'failed';
  if (initTimer) clearTimeout(initTimer);
  initTimer = null;
  logwarn('[tokenizer-worker] unavailable —', reason);
  for (const { resolve, timer } of pending.values()) {
    clearTimeout(timer);
    resolve(null);
  }
  pending.clear();
  warmResolve?.(false);
  warmResolve = null;
}

/**
 * Build the tokenizer in the WebView. Called from the host on page load;
 * idempotent. Resolves true once the page reports ready.
 */
export function warmTokenizationWorker(): Promise<boolean> {
  if (warmPromise) return warmPromise;
  warmPromise = new Promise<boolean>((resolve) => {
    warmResolve = resolve;
  });
  void runWarm();
  return warmPromise;
}

async function runWarm(): Promise<void> {
  if (status !== 'idle') {
    log(`[tokenizer-worker] warm skipped — status: ${status}`);
    warmResolve?.(status === 'ready');
    warmResolve = null;
    return;
  }
  if (!webViewRef) {
    log('[tokenizer-worker] warm skipped — WebView not attached');
    status = 'failed';
    warmResolve?.(false);
    warmResolve = null;
    return;
  }

  status = 'loading';
  initTimer = setTimeout(() => {
    markFailed('init timeout — no ready message from page');
  }, INIT_TIMEOUT_MS);

  try {
    const hasData = await hasKuromojiData('ja');
    if (!hasData) {
      log('[tokenizer-worker] no ja data pack — worker idle (main-thread fallback stays)');
      if (initTimer) clearTimeout(initTimer);
      initTimer = null;
      status = 'failed';
      warmResolve?.(false);
      warmResolve = null;
      return;
    }

    const dir = getKuromojiDataPath('ja');
    log('[tokenizer-worker] copying kuromoji data pack into WebView');
    let totalChunks = 0;
    for (const name of KROMOJI_DICT_FILES) {
      const bytes = await new File(`${dir}${name}`).bytes();
      const b64 = bytesToBase64(bytes);
      const total = Math.ceil(b64.length / CHUNK_BYTES);
      totalChunks += total;
      for (let i = 0; i < total; i++) {
        const chunk = b64.slice(i * CHUNK_BYTES, (i + 1) * CHUNK_BYTES);
        await injectQueued(`window.__lpAppend(${JSON.stringify(name)}, ${i}, ${JSON.stringify(chunk)}, ${total})`);
      }
    }
    log(`[tokenizer-worker] copied ${KROMOJI_DICT_FILES.length} files, ${totalChunks} chunks — building tokenizer`);
    await injectQueued(`window.__lpInit(${JSON.stringify(KROMOJI_DICT_FILES)})`);
  } catch (e) {
    markFailed((e as Error)?.message ?? String(e));
  }
}

export function handleTokenizationWorkerMessage(raw: string): void {
  let msg: { type: string; id?: string; kind?: string; l2?: string; tokens?: WorkerToken[]; error?: string };
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }

  if (msg.type === 'kuromoji') {
    log(`[tokenizer-worker] kuromoji loaded in page: ${(msg as { exists?: boolean }).exists ?? false}`);
    return;
  }
  if (msg.type === 'ready') {
    if (initTimer) clearTimeout(initTimer);
    initTimer = null;
    status = 'ready';
    log('[tokenizer-worker] ✅ tokenizer ready');
    warmResolve?.(true);
    warmResolve = null;
    return;
  }
  if (msg.type === 'ready_dict') {
    const l2 = msg.l2 ?? '';
    if (l2) {
      const t = dictInitTimers.get(l2);
      if (t) clearTimeout(t);
      dictInitTimers.delete(l2);
      dictStatus.set(l2, 'ready');
      log(`[tokenizer-worker] ✅ dict tokenizer ready (${l2})`);
      dictWarmResolvers.get(l2)?.(true);
      dictWarmResolvers.delete(l2);
    }
    return;
  }
  if (msg.type === 'dict_chunk') {
    const l2 = msg.l2 ?? '';
    const idx = (msg as { index?: number }).index;
    if (l2 && typeof idx === 'number') {
      let set = dictChunkAcks.get(l2);
      if (!set) {
        set = new Set();
        dictChunkAcks.set(l2, set);
      }
      set.add(idx);
    }
    return;
  }
  if (msg.type === 'error' && !msg.id) {
    if (msg.kind === 'dict' && msg.l2) {
      const t = dictInitTimers.get(msg.l2);
      if (t) clearTimeout(t);
      dictInitTimers.delete(msg.l2);
      dictStatus.set(msg.l2, 'failed');
      logwarn(
        `[tokenizer-worker] dict init error (${msg.l2}):`,
        msg.error ?? 'unknown',
        (msg as { got?: number; total?: number }).got != null
          ? `(chunks ${(msg as { got?: number }).got}/${(msg as { total?: number }).total})`
          : '',
      );
      dictWarmResolvers.get(msg.l2)?.(false);
      dictWarmResolvers.delete(msg.l2);
      dictWarmPromises.delete(msg.l2);
      return;
    }
    markFailed(msg.error ?? 'init error');
    return;
  }
  if (msg.type === 'result' || (msg.type === 'error' && msg.id)) {
    const entry = msg.id ? pending.get(msg.id) : undefined;
    if (!entry) return;
    clearTimeout(entry.timer);
    pending.delete(msg.id!);
    entry.resolve(
      msg.type === 'result' && Array.isArray(msg.tokens)
        ? msg.kind === 'ja'
          ? msg.tokens.map(toLemmatized)
          : (msg.tokens as unknown as LemmatizedToken[])
        : null,
    );
  }
}

let warnedFallback = false;

/** Tokenize one line in the WebView, or null if unavailable/timed out. */
export async function tokenizeJapaneseInWorker(text: string): Promise<LemmatizedToken[] | null> {
  if (status === 'ready' && webViewRef) {
    return requestJaTokenize(text);
  }
  if (status === 'loading' && warmPromise) {
    // Warm is already in flight (usually from app launch) — wait briefly so
    // the first reader page uses the worker instead of falling back.
    const ok = await waitWithTimeout(warmPromise, 1500);
    if (ok && webViewRef) return requestJaTokenize(text);
    return null;
  }
  if (!warnedFallback) {
    warnedFallback = true;
    logwarn(`[tokenizer-worker] not ready (${status}) — main-thread fallback`);
  }
  return null;
}

function requestJaTokenize(text: string): Promise<LemmatizedToken[] | null> {
  const id = `ja_${++seq}`;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      logwarn(`[tokenizer-worker] tokenize timeout (${id}) — page did not reply`);
      resolve(null);
    }, TOKENIZE_TIMEOUT_MS);
    pending.set(id, { resolve, timer });
    // ASCII-escaped inject: the proven large-payload channel (kuromoji chunks
    // are 128 KB) and immune to WKWebView's non-ASCII injectJavaScript bug.
    inject(`window.__lpTokenize(${JSON.stringify(id)}, "${toJsLiteral(JSON.stringify(text))}")`);
  });
}

/** Called when the WebView itself fails to load. */
export function markTokenizationWorkerFailed(): void {
  markFailed('webview load error');
}

// ── Dict-based segmentation worker (Chinese + SEA, SPEC-018 Phase 2b) ──

export function isDictTokenizationWorkerReady(l2: string): boolean {
  return dictStatus.get(l2) === 'ready';
}

/**
 * Load a language's dictionary headword set into the WebView. Uses the same
 * SQLite query as tokenizer.ts loadDictWordSet() — head + alternate from the
 * offline dictionary — serialized as a JSON array and streamed in chunks.
 */
export function warmTokenizationWorkerDict(l2: string): Promise<boolean> {
  const existing = dictWarmPromises.get(l2);
  if (existing) return existing;
  const promise = new Promise<boolean>((resolve) => {
    dictWarmResolvers.set(l2, resolve);
  });
  dictWarmPromises.set(l2, promise);
  void runWarmDict(l2);
  return promise;
}

/**
 * Drop a language's dict-segmentation state after its offline dictionary is
 * re-downloaded or deleted. The WebView keeps a copy of the old headword set
 * and pronunciations, so it must be reset too — otherwise the next warm call
 * would see `ready` and keep using stale data.
 */
export function resetDictWorker(l2: string): void {
  dictStatus.delete(l2);
  dictWarmPromises.delete(l2);
  dictWarmResolvers.delete(l2);
  const timer = dictInitTimers.get(l2);
  if (timer) {
    clearTimeout(timer);
    dictInitTimers.delete(l2);
  }
  dictChunkAcks.delete(l2);
  dictChunkTotal.delete(l2);
  dictInitRetried.delete(l2);
  if (webViewRef) {
    void injectQueued(`window.__lpResetDict(${JSON.stringify(JSON.stringify(l2))})`).catch(() => {});
  }
}

async function runWarmDict(l2: string): Promise<void> {
  const finish = (ok: boolean) => {
    dictWarmResolvers.get(l2)?.(ok);
    dictWarmResolvers.delete(l2);
    dictWarmPromises.delete(l2);
  };
  const st = dictStatus.get(l2);
  if (st === 'ready') { finish(true); return; }
  if (st === 'failed') { finish(false); return; }
  if (!webViewRef) {
    // WebView not mounted yet — don't mark failed; the next warm call (after
    // the host's html is ready) will retry from scratch.
    finish(false);
    return;
  }

  dictStatus.set(l2, 'loading');
  const timer = setTimeout(() => {
    // Retry init once before giving up — chunks persist in the page, so a
    // dropped init call is recoverable.
    if (!dictInitRetried.has(l2) && webViewRef) {
      dictInitRetried.add(l2);
      logwarn(`[tokenizer-worker] dict init timeout (${l2}) — retrying init`);
      void injectQueued(`window.__lpInitDict(${JSON.stringify(JSON.stringify(l2))}, ${dictChunkTotal.get(l2) ?? 0})`);
      dictInitTimers.set(l2, setTimeout(() => {
        dictStatus.set(l2, 'failed');
        dictInitTimers.delete(l2);
        logwarn(`[tokenizer-worker] dict init timeout (${l2}) — no ready message from page`);
        finish(false);
      }, INIT_TIMEOUT_MS));
      return;
    }
    dictStatus.set(l2, 'failed');
    dictInitTimers.delete(l2);
    logwarn(`[tokenizer-worker] dict init timeout (${l2}) — no ready message from page`);
    finish(false);
  }, INIT_TIMEOUT_MS);
  dictInitTimers.set(l2, timer);

  try {
    const { openOfflineDictionaryDB, openDictionaryDB } = await import('@/lib/dictionary-db');
    let l2Db: Awaited<ReturnType<typeof openOfflineDictionaryDB>> | null = null;
    try {
      l2Db = await openOfflineDictionaryDB(l2);
    } catch {
      l2Db = null;
    }
    const db = l2Db ?? (await openDictionaryDB());
    const table = `dict_${l2.replace(/-/g, '_')}`;
    // part_of_speech is optional — the column doesn't exist in current zh
    // downloads (POS parity for zh needs a server sidecar export), so probe
    // it defensively and fall back to the two-column query.
    let rows: Array<{ head: string; pronunciation: string | null; part_of_speech: string | null }>;
    try {
      rows = await db.getAllAsync<{ head: string; pronunciation: string | null; part_of_speech: string | null }>(
        `SELECT head, pronunciation, part_of_speech FROM ${table} WHERE head != ''
         UNION
         SELECT alternate, pronunciation, part_of_speech FROM ${table} WHERE alternate IS NOT NULL AND alternate != ''`,
      );
    } catch {
      rows = await db.getAllAsync<{ head: string; pronunciation: string | null; part_of_speech: string | null }>(
        `SELECT head, pronunciation FROM ${table} WHERE head != ''
         UNION
         SELECT alternate, pronunciation FROM ${table} WHERE alternate IS NOT NULL AND alternate != ''`,
      );
    }
    if (!rows || rows.length === 0) {
      if (dictInitTimers.get(l2)) { clearTimeout(dictInitTimers.get(l2)!); dictInitTimers.delete(l2); }
      dictStatus.set(l2, 'failed');
      log(`[tokenizer-worker] no dict data for ${l2} — worker idle (main-thread fallback stays)`);
      finish(false);
      return;
    }

    const seen = new Set<string>();
    const pinyin = new Map<string, string>();
    const posByWord = new Map<string, string>();
    for (const row of rows) {
      if (row.head && !seen.has(row.head)) {
        seen.add(row.head);
        const cleaned = cleanPronunciation(row.pronunciation);
        if (cleaned) pinyin.set(row.head, cleaned);
        if (row.part_of_speech) posByWord.set(row.head, row.part_of_speech);
      }
    }
    const words = Array.from(seen);
    const pronunciations = words.map((w) => pinyin.get(w) ?? null);
    const posList = words.map((w) => posByWord.get(w) ?? null);
    if (l2 === 'th') {
      const pronCount = pronunciations.filter((p) => !!p).length;
      const sample = words.slice(0, 8).map((w) => `${w}→${pinyin.get(w) ?? '∅'}`).join(', ');
      log(`[tokenizer-worker] th dict pron map: ${pronCount}/${words.length} words have pronunciation; sample: ${sample}`);
    }
    // {w, p, pos} — pinyin drives furigana-style phonetics (tone-marked
    // client-side); pos is attached to lemmas when the dictionary provides it.
    const json = JSON.stringify({ w: words, p: pronunciations, pos: posList });
    const encoder = new TextEncoder();
    const total = Math.ceil(json.length / DICT_CHUNK_BYTES);
    dictChunkAcks.set(l2, new Set());
    dictInitRetried.delete(l2);
    dictChunkTotal.set(l2, total);
    const chunks: string[] = [];
    for (let i = 0; i < total; i++) {
      chunks.push(bytesToBase64(encoder.encode(json.slice(i * DICT_CHUNK_BYTES, (i + 1) * DICT_CHUNK_BYTES))));
    }
    log(`[tokenizer-worker] copying dict word set into WebView (${l2}, ${words.length} words)`);
    // Ack-based streaming: WKWebView unpredictably drops evaluateJavaScript
    // calls, so keep re-sending unacked chunks until the page confirms all.
    for (let round = 0; round < 3; round++) {
      const missing: number[] = [];
      for (let i = 0; i < total; i++) {
        if (!dictChunkAcks.get(l2)?.has(i)) missing.push(i);
      }
      if (missing.length === 0) break;
      for (const i of missing) {
        await injectQueued(`window.__lpAppendDict(${JSON.stringify(l2)}, ${i}, ${JSON.stringify(chunks[i]!)}, ${total})`);
      }
      const deadline = Date.now() + 3000;
      while (Date.now() < deadline) {
        let done = true;
        for (let i = 0; i < total; i++) {
          if (!dictChunkAcks.get(l2)?.has(i)) {
            done = false;
            break;
          }
        }
        if (done) break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      const received = dictChunkAcks.get(l2)?.size ?? 0;
      log(`[tokenizer-worker] dict chunks acked ${received}/${total} (round ${round + 1})`);
    }
    const confirmed = dictChunkAcks.get(l2)?.size ?? 0;
    if (confirmed < total) {
      if (dictInitTimers.get(l2)) { clearTimeout(dictInitTimers.get(l2)!); dictInitTimers.delete(l2); }
      dictStatus.set(l2, 'failed');
      logwarn(`[tokenizer-worker] dict chunks incomplete (${confirmed}/${total}) — giving up`);
      finish(false);
      return;
    }
    // __lpInitDict expects the JSON *text* for l2 (it JSON.parses it), so the
    // value must be double-encoded: "zh" → "\"zh\"" in the injected source.
    log(`[tokenizer-worker] all dict chunks acked — building (${l2})`);
    await injectQueued(`window.__lpInitDict(${JSON.stringify(JSON.stringify(l2))}, ${total})`);
  } catch (e) {
    if (dictInitTimers.get(l2)) { clearTimeout(dictInitTimers.get(l2)!); dictInitTimers.delete(l2); }
    dictStatus.set(l2, 'failed');
    logwarn(`[tokenizer-worker] dict warm failed (${l2}):`, (e as Error)?.message ?? e);
    finish(false);
  }
}

let warnedDictFallback = false;

/**
 * Tokenize one line with dict-based segmentation in the WebView, or null if
 * unavailable/timed out. Mirrors tokenizer.ts maxMatchSegment + surface-as-lemma.
 */
export function tokenizeDictSegInWorker(text: string, l2: string): Promise<LemmatizedToken[] | null> {
  return (async () => {
    const st = dictStatus.get(l2);
    if (st === 'ready' && webViewRef) {
      return requestDictTokenize(text, l2);
    }
    // Warm is in flight (launch or a previous call) — wait briefly so the
    // first reader page uses the worker.
    const warm = st === 'loading'
      ? dictWarmPromises.get(l2) ?? null
      : (st === 'idle' || st === undefined ? warmTokenizationWorkerDict(l2) : null);
    if (warm) {
      const ok = await waitWithTimeout(warm, 1500);
      if (ok && webViewRef) return requestDictTokenize(text, l2);
      return null;
    }
    if (st !== 'ready' && !warnedDictFallback) {
      warnedDictFallback = true;
      logwarn(`[tokenizer-worker] dict not ready (${l2}: ${st ?? 'idle'}) — main-thread fallback`);
    }
    return null;
  })();
}

function requestDictTokenize(text: string, l2: string): Promise<LemmatizedToken[] | null> {
  const id = `dict_${++seq}`;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      logwarn(`[tokenizer-worker] dict tokenize timeout (${id}) — page did not reply`);
      resolve(null);
    }, TOKENIZE_TIMEOUT_MS);
    pending.set(id, { resolve, timer });
    inject(
      `window.__lpTokenizeDict(${JSON.stringify(id)}, ${JSON.stringify(JSON.stringify(l2))}, "${toJsLiteral(JSON.stringify(text))}")`,
    );
  });
}

/** Build the docs-style page: kuromoji in a script tag + in-memory loader. */
export function buildWorkerPageHtml(kuromojiSource: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body>
<script>
${kuromojiSource}
<\/script>
<script>
(function () {
  function post(data) {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(
        typeof data === 'string' ? data : JSON.stringify(data)
      );
    }
  }

  var exists = typeof kuromoji !== 'undefined';
  post({
    type: 'kuromoji',
    exists: exists,
    keys: exists ? Object.keys(kuromoji) : []
  });

  var REQUIRED_FILES = [
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
    'unk_invoke.dat.gz'
  ];
  var chunks = {};
  var chunkTotals = {};
  var tokenizer = null;

  function base64ToUint8(b64) {
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  function allFilesComplete() {
    for (var f = 0; f < REQUIRED_FILES.length; f++) {
      var name = REQUIRED_FILES[f];
      var total = chunkTotals[name] || 0;
      var received = 0;
      for (var i = 0; i < total; i++) {
        if (typeof chunks[name] !== 'undefined' && typeof chunks[name][i] === 'string') received++;
      }
      if (received !== total) {
        return 'incomplete chunks for ' + name + ' (' + received + '/' + total + ')';
      }
    }
    return null;
  }

  // The official browser build fetches dict files with XMLHttpRequest and
  // gunzips them itself; serve our streamed files from memory instead.
  function FakeXHR() {
    this.status = 0;
    this.response = null;
  }
  FakeXHR.prototype.open = function (method, url) {
    this.url = url;
  };
  FakeXHR.prototype.send = function () {
    var self = this;
    var name = String(this.url).split('/').pop();
    var b64 = chunks[name];
    setTimeout(function () {
      if (!b64) {
        self.status = 404;
        if (self.onerror) self.onerror(new Error('no dictionary file: ' + name));
        return;
      }
      var bytes = base64ToUint8(b64.join(''));
      self.status = 200;
      self.response = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      if (self.onload) self.onload();
    }, 0);
  };

  window.__lpAppend = function (name, index, chunk, total) {
    if (!chunks[name]) chunks[name] = [];
    if (chunks[name][index] === undefined) {
      chunks[name][index] = chunk;
      chunkTotals[name] = total;
    }
  };

  // Per the kuromoji docs: kuromoji.builder({ dicPath }).build(cb).
  window.__lpInit = function (namesJson) {
    var incomplete = allFilesComplete();
    if (incomplete) {
      post({ type: 'error', error: incomplete });
      return;
    }
    window.XMLHttpRequest = FakeXHR;
    kuromoji.builder({ dicPath: 'lp://dict/' }).build(function (err, tok) {
      if (err) {
        post({ type: 'error', error: String((err && err.stack) || err) });
        return;
      }
      tokenizer = tok;
      post({ type: 'ready' });
    });
  };

  window.__lpTokenize = function (id, textJson) {
    try {
      if (!tokenizer) throw new Error('tokenizer not initialized');
      var tokens = tokenizer.tokenize(JSON.parse(textJson)).map(function (t) {
        return {
          surface_form: t.surface_form,
          basic_form: t.basic_form,
          reading: t.reading,
          pronunciation: t.pronunciation,
          pos: t.pos
        };
      });
      post({ type: 'result', id: id, kind: 'ja', tokens: tokens });
    } catch (e) {
      post({ type: 'error', id: id, error: String((e && e.stack) || e) });
    }
  };

  // ── Dict-based segmentation datasets (Chinese + SEA, SPEC-018 Phase 2b) ──
  // Data is the offline dictionary headword set (simplified + alternate
  // forms) plus per-head pinyin, serialized as {w:[...], p:[...]} and
  // streamed in chunks.
  var dictChunks = {};
  var dictTotals = {};
  var dictReadyL2 = null;
  var dictSet = null;
  var dictPinyin = {};
  var dictPos = {};
  var dictMaxLen = 1;

  // CC-CEDICT writes ü as "u:" — canonicalize to "v" like the server does,
  // then convert numeric tone (ni3 hao3) to tone marks (nǐ hǎo).
  var TONE_MARKS = {
    a: ['ā', 'á', 'ǎ', 'à'],
    e: ['ē', 'é', 'ě', 'è'],
    i: ['ī', 'í', 'ǐ', 'ì'],
    o: ['ō', 'ó', 'ǒ', 'ò'],
    u: ['ū', 'ú', 'ǔ', 'ù'],
    ü: ['ǖ', 'ǘ', 'ǚ', 'ǜ']
  };
  function applyToneMark(syllable, tone) {
    var lower = syllable.toLowerCase();
    var positions = [];
    for (var i = 0; i < lower.length; i++) {
      if ('aeoiuüv'.indexOf(lower.charAt(i)) !== -1) positions.push(i);
    }
    if (positions.length === 0) return syllable;
    var pos = null;
    for (var pi = 0; pi < positions.length; pi++) {
      var v = lower.charAt(positions[pi]);
      if (v === 'a' || v === 'e') { pos = positions[pi]; break; }
    }
    if (pos === null) {
      for (var oi = 0; oi < positions.length; oi++) {
        if (lower.charAt(positions[oi]) === 'o') { pos = positions[oi]; break; }
      }
    }
    if (pos === null) pos = positions[positions.length - 1];
    var vowel = lower.charAt(pos);
    var key = (vowel === 'v') ? 'ü' : vowel;
    var marks = TONE_MARKS[key] || [];
    var mark = marks[tone - 1];
    if (!mark) return syllable;
    return syllable.slice(0, pos) + mark + syllable.slice(pos + 1);
  }
  function toToneMarks(pinyin) {
    if (!pinyin) return pinyin;
    pinyin = pinyin.replace(/u:/g, 'v').replace(/U:/g, 'V');
    var syllables = pinyin.split(' ');
    var out = [];
    for (var s = 0; s < syllables.length; s++) {
      var syl = syllables[s];
      var tone = null;
      var base = syl;
      if (syl.length > 0 && /[0-9]/.test(syl.charAt(syl.length - 1))) {
        tone = parseInt(syl.charAt(syl.length - 1), 10);
        base = syl.slice(0, -1);
      }
      if (tone >= 1 && tone <= 4) {
        out.push(applyToneMark(base, tone));
      } else if (tone === 5) {
        out.push(base);
      } else {
        out.push(syl);
      }
    }
    return out.join(' ').toLowerCase();
  }

  window.__lpAppendDict = function (l2, index, chunk, total) {
    if (!dictChunks[l2]) dictChunks[l2] = [];
    if (dictChunks[l2][index] === undefined) {
      dictChunks[l2][index] = chunk;
      dictTotals[l2] = total;
    }
    var got = 0;
    for (var i = 0; i < total; i++) {
      if (typeof dictChunks[l2] !== 'undefined' && typeof dictChunks[l2][i] === 'string') got++;
    }
    post({ type: 'dict_chunk', l2: l2, index: index, got: got, total: total });
  };

  window.__lpResetDict = function (l2Json) {
    var l2 = JSON.parse(l2Json);
    if (dictChunks[l2]) delete dictChunks[l2];
    if (dictTotals[l2]) delete dictTotals[l2];
    if (dictReadyL2 === l2) {
      dictReadyL2 = null;
      dictSet = null;
      dictPinyin = {};
      dictPos = {};
      dictMaxLen = 1;
    }
    post({ type: 'dict_reset', l2: l2 });
  };

  window.__lpInitDict = function (l2Json, totalJson) {
    try {
      var l2 = JSON.parse(l2Json);
      var total = parseInt(totalJson, 10);
      var got = 0;
      for (var i = 0; i < total; i++) {
        if (typeof dictChunks[l2] !== 'undefined' && typeof dictChunks[l2][i] === 'string') got++;
      }
      if (got !== total) throw new Error('incomplete dict chunks for ' + l2 + ' (' + got + '/' + total + ')');
      // Chunks arrive as individually-padded base64 — decoding each separately
      // and concatenating the bytes avoids invalid mid-string padding.
      var parts = [];
      var byteLen = 0;
      for (var ci = 0; ci < total; ci++) {
        var part = base64ToUint8(dictChunks[l2][ci]);
        parts.push(part);
        byteLen += part.length;
      }
      var bytes = new Uint8Array(byteLen);
      var off = 0;
      for (var pi = 0; pi < parts.length; pi++) {
        bytes.set(parts[pi], off);
        off += parts[pi].length;
      }
      var decoded = new TextDecoder('utf-8').decode(bytes);
      var data = JSON.parse(decoded);
      var words = data.w;
      var pinyinList = data.p;
      var posList = data.pos;
      if (!Array.isArray(words) || !Array.isArray(pinyinList) || !Array.isArray(posList)) {
        throw new Error('dict dataset is not {w,p,pos}');
      }
      dictSet = new Set();
      dictPinyin = {};
      dictPos = {};
      dictMaxLen = 1;
      for (var w = 0; w < words.length; w++) {
        var word = String(words[w]);
        if (!word) continue;
        dictSet.add(word);
        if (word.length > dictMaxLen) dictMaxLen = word.length;
      }
      for (var pi = 0; pi < pinyinList.length && pi < words.length; pi++) {
        var pWord = String(words[pi] || '');
        var pPy = pinyinList[pi];
        if (pWord && pPy) dictPinyin[pWord] = String(pPy);
      }
      for (var qi = 0; qi < posList.length && qi < words.length; qi++) {
        var qWord = String(words[qi] || '');
        var qPos = posList[qi];
        if (qWord && qPos) dictPos[qWord] = String(qPos);
      }
      dictReadyL2 = l2;
      post({ type: 'ready_dict', l2: l2, words: dictSet.size, maxLen: dictMaxLen });
    } catch (e) {
      post({
        type: 'error',
        kind: 'dict',
        l2: l2,
        error: String((e && e.message) || e),
        stack: String((e && e.stack) || ''),
        got: got,
        total: total,
      });
    }
  };

  // Forward maximum matching — same algorithm as tokenizer.ts maxMatchSegment.
  window.__lpTokenizeDict = function (id, l2Json, textJson) {
    try {
      var l2 = JSON.parse(l2Json);
      if (l2 !== dictReadyL2 || !dictSet) throw new Error('dict dataset not ready for ' + l2);
      var text = JSON.parse(textJson);
      var tokens = [];
      var i = 0;
      while (i < text.length) {
        var ch = text.charAt(i);
        // Group ASCII letters/digits into one token (matches the server's
        // jieba output: ISBN, 978, URLs — not 9/7/8 char-by-char).
        if (/[A-Za-z0-9]/.test(ch)) {
          var runStart = i;
          i++;
          while (i < text.length && /[A-Za-z0-9]/.test(text.charAt(i))) i++;
          var run = text.slice(runStart, i);
          tokens.push({ text: run, lemmas: [{ lemma: run }], pronunciation: run, source: 'dict-seg' });
          continue;
        }
        var longestMatch = text.charAt(i);
        var searchEnd = Math.min(i + dictMaxLen, text.length);
        for (var len = searchEnd - i; len >= 1; len--) {
          var candidate = text.slice(i, i + len);
          if (dictSet.has(candidate)) {
            longestMatch = candidate;
            break;
          }
        }
        // Thai/SEA spacing marks (Unicode \p{M}) must stay attached to the
        // previous token — as standalone tokens they render disjoined in ruby
        // mode (marks need to share the same text run as their consonant).
        if (longestMatch.length === 1 && /\\p{M}/u.test(ch) && tokens.length > 0) {
          var prevTok = tokens[tokens.length - 1];
          prevTok.text += ch;
          prevTok.lemmas = [{ lemma: prevTok.text }];
          i++;
          continue;
        }
        var py = dictPinyin[longestMatch] ? toToneMarks(dictPinyin[longestMatch]) : null;
        var lem = { lemma: longestMatch };
        if (dictPos[longestMatch]) lem.part_of_speech = dictPos[longestMatch];
        var token = { text: longestMatch, lemmas: [lem], source: 'dict-seg' };
        if (py) token.pronunciation = py;
        tokens.push(token);
        i += longestMatch.length;
      }
      post({ type: 'result', id: id, kind: 'dict', tokens: tokens });
    } catch (e) {
      post({ type: 'error', id: id, error: String((e && e.stack) || e) });
    }
  };

})();
<\/script>
</body>
</html>`;
}
