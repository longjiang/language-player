import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { log, logwarn } from '@/lib/logger';
import {
  attachTokenizationWebView,
  buildWorkerPageHtml,
  handleTokenizationWorkerMessage,
  markTokenizationWorkerFailed,
  tokenizeJapaneseInWorker,
  warmTokenizationWorker,
} from '@/lib/tokenizer-worker';

/** Launch self-test: proves the full RN→page→RN tokenize channel works. */
const LAUNCH_PROBE = '冬の寒さが和らぐと、春になると生物の活動が活発になる。';

/**
 * Persistent invisible WebView that runs kuromoji off the RN JS thread.
 *
 * Loads the official kuromoji browser build in a <script> tag, builds the
 * tokenizer from the on-device data pack, and serves Japanese tokenization
 * requests (see lib/tokenizer-worker.ts). Falls back to the main-thread
 * tokenizer automatically when unavailable.
 */
export function TokenizationWorkerHost() {
  const webViewRef = useRef<WebView>(null);
  const [html, setHtml] = useState<string | null>(null);

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
        log(`[tokenizer-worker] loaded kuromoji source (${kuromojiSource.length} chars)`);
        setHtml(buildWorkerPageHtml(kuromojiSource));
      } catch (e) {
        if (!cancelled) {
          logwarn('[tokenizer-worker] failed to read kuromoji asset:', (e as Error)?.message ?? e);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // The WebView mounts only after the page HTML is ready — attach the ref to
  // the bridge at that point so onLoadEnd → warm finds it attached.
  useEffect(() => {
    attachTokenizationWebView(webViewRef.current);
    return () => attachTokenizationWebView(null);
  }, [html]);

  const handleLoadEnd = useCallback(() => {
    void (async () => {
      const ready = await warmTokenizationWorker();
      if (!ready) {
        logwarn('[tokenizer-worker] warm failed — launch probe skipped');
        return;
      }
      const tokens = await tokenizeJapaneseInWorker(LAUNCH_PROBE);
      if (!tokens) {
        logwarn('[tokenizer-worker] launch probe failed — page did not reply');
        return;
      }
      log(`[tokenizer-worker] 🎯 launch probe OK — tokens=${tokens.length}`);
      log(
        '[tokenizer-worker] 🎯 sample:',
        tokens
          .slice(0, 12)
          .map((t) => `${t.text}→${t.lemmas[0]?.lemma ?? ''}(${t.pronunciation ?? ''})`)
          .join(' | '),
      );
    })();
  }, []);

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    handleTokenizationWorkerMessage(event.nativeEvent.data);
  }, []);

  const handleError = useCallback((event: { nativeEvent?: { description?: string } }) => {
    logwarn('[tokenizer-worker] WebView error:', event.nativeEvent?.description ?? 'unknown');
    markTokenizationWorkerFailed();
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
          onError={handleError}
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
