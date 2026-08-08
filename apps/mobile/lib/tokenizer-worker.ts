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
import { log, logwarn } from '@/lib/logger';

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

const CHUNK_BYTES = 128 * 1024;
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

/** Map a kuromoji token to the app's LemmatizedToken (mirrors tokenizeJapanese). */
function toLemmatized(t: WorkerToken): LemmatizedToken {
  return {
    text: t.surface_form,
    lemmas: [{ lemma: t.basic_form || t.surface_form }],
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
        inject(`window.__lpAppend(${JSON.stringify(name)}, ${i}, ${JSON.stringify(chunk)}, ${total})`);
        // Let the native bridge drain between large injections.
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
    log(`[tokenizer-worker] copied ${KROMOJI_DICT_FILES.length} files, ${totalChunks} chunks — building tokenizer`);
    inject(`window.__lpInit(${JSON.stringify(KROMOJI_DICT_FILES)})`);
  } catch (e) {
    markFailed((e as Error)?.message ?? String(e));
  }
}

export function handleTokenizationWorkerMessage(raw: string): void {
  let msg: { type: string; id?: string; tokens?: WorkerToken[]; error?: string };
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
  if (msg.type === 'error' && !msg.id) {
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
        ? msg.tokens.map(toLemmatized)
        : null,
    );
  }
}

let warnedFallback = false;

/** Tokenize one line in the WebView, or null if unavailable/timed out. */
export function tokenizeJapaneseInWorker(text: string): Promise<LemmatizedToken[] | null> {
  if (status !== 'ready' || !webViewRef) {
    if (!warnedFallback) {
      warnedFallback = true;
      logwarn(`[tokenizer-worker] not ready (${status}) — main-thread fallback`);
    }
    return Promise.resolve(null);
  }
  const id = `ja_${++seq}`;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      logwarn(`[tokenizer-worker] tokenize timeout (${id}) — page did not reply`);
      resolve(null);
    }, TOKENIZE_TIMEOUT_MS);
    pending.set(id, { resolve, timer });
    // postMessage, not injectJavaScript: injectJavaScript drops/fails with
    // non-ASCII text on WKWebView (observed: all 13 reader tokenize calls
    // timed out while ASCII chunk injections worked fine).
    webViewRef?.postMessage(JSON.stringify({ type: 'tokenize', id, text }));
  });
}

/** Called when the WebView itself fails to load. */
export function markTokenizationWorkerFailed(): void {
  markFailed('webview load error');
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
      post({ type: 'result', id: id, tokens: tokens });
    } catch (e) {
      post({ type: 'error', id: id, error: String((e && e.stack) || e) });
    }
  };

  // RN sends tokenize requests through webView.postMessage() (JSON string) —
  // unlike injectJavaScript, this channel is proven to carry Japanese text.
  window.addEventListener('message', function (event) {
    var raw = event.data;
    if (typeof raw !== 'string' || raw.charAt(0) !== '{') return;
    var req;
    try {
      req = JSON.parse(raw);
    } catch (e) {
      post({ type: 'error', error: String((e && e.stack) || e) });
      return;
    }
    if (req && req.type === 'tokenize') {
      window.__lpTokenize(req.id, JSON.stringify(req.text));
    }
  });
})();
<\/script>
</body>
</html>`;
}
