import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { log, logwarn } from '@/lib/logger';
import { KROMOJI_DICT_FILES, getKuromojiDataPath, hasKuromojiData } from '@/lib/tokenizer-db';

/**
 * Invisible WebView kuromoji browser-tag probe.
 *
 * Loads kuromoji exactly the way the docs describe: the page includes
 * build/kuromoji.js in a <script> tag, then `kuromoji.builder({ dicPath })`
 * loads the dictionary over XHR (shimmed in-memory here) and tokenizes a
 * Japanese sentence. Results are posted back and logged to Metro, alongside
 * the original reverse round-trip channel check.
 */

const PROBE_MESSAGE = '冬の寒さが和らぐと、春になると生物の活動が活発になる。';
const CHUNK_BYTES = 128 * 1024;
const INIT_TIMEOUT_MS = 30000;
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

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

/** Build the docs-style page: kuromoji script tag + dictionary loader shim. */
function buildPageHtml(kuromojiSource: string): string {
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
  var PROBE_TEXT = '冬の寒さが和らぐと、春になると生物の活動が活発になる。';
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
      var tokens = tokenizer.tokenize(PROBE_TEXT).map(function (t) {
        return {
          surface_form: t.surface_form,
          basic_form: t.basic_form,
          reading: t.reading,
          pronunciation: t.pronunciation,
          pos: t.pos
        };
      });
      post({ type: 'result', tokens: tokens });
    });
  };

  // Round-trip sanity check (same as the original probe).
  window.addEventListener('message', function (event) {
    post(Array.from(String(event.data)).reverse().join(''));
  });
})();
<\/script>
</body>
</html>`;
}

export function WorkerProbeWebView() {
  const webViewRef = useRef<WebView>(null);
  const [html, setHtml] = useState<string | null>(null);
  const postedRef = useRef(false);
  const repliedRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warmStartedRef = useRef(false);
  const initTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Read the vendored build/kuromoji.js (kept as an .html asset so Metro
  // bundles it as raw text) and build the docs-style page.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const asset = Asset.fromModule(require('@/assets/kuromoji/kuromoji.html'));
        await asset.downloadAsync();
        const file = new File(asset.localUri ?? asset.uri);
        const kuromojiSource = await file.text();
        if (cancelled) return;
        log(`[WorkerProbe] loaded kuromoji source (${kuromojiSource.length} chars)`);
        setHtml(buildPageHtml(kuromojiSource));
      } catch (e) {
        if (!cancelled) {
          logwarn('[WorkerProbe] failed to read kuromoji asset:', (e as Error)?.message ?? e);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Copy the on-device kuromoji data pack into the page, then build. */
  const streamDictionary = useCallback(async () => {
    if (warmStartedRef.current) return;
    warmStartedRef.current = true;
    try {
      const hasData = await hasKuromojiData('ja');
      if (!hasData) {
        logwarn('[WorkerProbe] no ja kuromoji data pack on device — skipping tokenizer build');
        return;
      }
      const dir = getKuromojiDataPath('ja');
      log('[WorkerProbe] copying kuromoji data pack into WebView');
      let totalChunks = 0;
      for (const name of KROMOJI_DICT_FILES) {
        const bytes = await new File(`${dir}${name}`).bytes();
        const b64 = bytesToBase64(bytes);
        const total = Math.ceil(b64.length / CHUNK_BYTES);
        totalChunks += total;
        for (let i = 0; i < total; i++) {
          const chunk = b64.slice(i * CHUNK_BYTES, (i + 1) * CHUNK_BYTES);
          webViewRef.current?.injectJavaScript(
            `window.__lpAppend(${JSON.stringify(name)}, ${i}, ${JSON.stringify(chunk)}, ${total}); true;`,
          );
          // Let the native bridge drain between large injections.
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }
      log(`[WorkerProbe] copied ${KROMOJI_DICT_FILES.length} files, ${totalChunks} chunks — building tokenizer`);
      webViewRef.current?.injectJavaScript(`window.__lpInit(${JSON.stringify(KROMOJI_DICT_FILES)}); true;`);
      initTimeoutRef.current = setTimeout(() => {
        logwarn('[WorkerProbe] tokenizer build timeout — no ready message from page');
      }, INIT_TIMEOUT_MS);
    } catch (e) {
      logwarn('[WorkerProbe] failed to stream kuromoji data pack:', (e as Error)?.message ?? e);
    }
  }, []);

  const handleLoadEnd = useCallback(() => {
    if (!postedRef.current) {
      postedRef.current = true;
      log('[WorkerProbe] posting message to invisible WebView:', PROBE_MESSAGE);
      webViewRef.current?.postMessage(PROBE_MESSAGE);
      timeoutRef.current = setTimeout(() => {
        if (!repliedRef.current) {
          logwarn('[WorkerProbe] no reply from WebView within 5s');
        }
      }, 5000);
    }
    void streamDictionary();
  }, [streamDictionary]);

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    const data = event.nativeEvent.data;
    if (data.startsWith('{')) {
      try {
        const msg = JSON.parse(data) as {
          type?: string;
          exists?: boolean;
          keys?: string[];
          error?: string;
          tokens?: Array<{ surface_form?: string; basic_form?: string; reading?: string }>;
        };
        if (msg.type === 'kuromoji') {
          log(
            `[WorkerProbe] kuromoji loaded via <script> tag: ${msg.exists ?? false}` +
              (msg.keys?.length ? ` (exports: ${msg.keys.join(', ')})` : ''),
          );
          return;
        }
        if (msg.type === 'ready') {
          if (initTimeoutRef.current) {
            clearTimeout(initTimeoutRef.current);
            initTimeoutRef.current = null;
          }
          log('[WorkerProbe] ✅ tokenizer built in page');
          return;
        }
        if (msg.type === 'result') {
          const tokens = msg.tokens ?? [];
          log(`[WorkerProbe] 🎯 TOKENIZED — tokens=${tokens.length}`);
          log(
            '[WorkerProbe] 🎯 sample:',
            tokens
              .slice(0, 20)
              .map((t) => `${t.surface_form ?? ''}→${t.basic_form ?? ''}(${t.reading ?? ''})`)
              .join(' | '),
          );
          return;
        }
        if (msg.type === 'error') {
          logwarn('[WorkerProbe] page error:', msg.error ?? 'unknown');
          return;
        }
      } catch {
        // Not JSON — fall through to the round-trip handler below.
      }
    }
    repliedRef.current = true;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    log('[WorkerProbe] page replied with reversed message:', data);
  }, []);

  return (
    <View
      style={{
        position: 'absolute',
        left: -100,
        top: -100,
        width: 0,
        height: 0,
        overflow: 'hidden',
      }}
      pointerEvents="none"
    >
      {html && (
        <WebView
          ref={webViewRef}
          source={{ html, baseUrl: 'https://langplayer-worker.local/' }}
          onLoadEnd={handleLoadEnd}
          onMessage={handleMessage}
          onError={(event) => logwarn('[WorkerProbe] WebView failed to load:', event.nativeEvent.description)}
          javaScriptEnabled
          domStorageEnabled
          originWhitelist={['*']}
          containerStyle={{ width: 0, height: 0, overflow: 'hidden' }}
          style={{ width: 0, height: 0, opacity: 0 }}
        />
      )}
    </View>
  );
}
