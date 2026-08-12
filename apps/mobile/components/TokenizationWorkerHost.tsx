import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { TOKENIZER_CONFIG } from '@langplayer/shared';
import { baseCode } from '@langplayer/utils';
import { tokenizerWorkerLogger } from '@/lib/logger';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  attachTokenizationWebView,
  buildWorkerPageHtml,
  handleTokenizationWorkerMessage,
  markTokenizationWorkerFailed,
  warmTokenizationWorkerDict,
  warmTokenizationWorker,
} from '@/lib/tokenizer-worker';

const { log, logwarn } = tokenizerWorkerLogger;

/**
 * Persistent invisible WebView that runs kuromoji off the RN JS thread.
 *
 * Loads the official kuromoji browser build in a <script> tag, builds the
 * tokenizer from the on-device data pack, and serves Japanese tokenization
 * requests (see lib/tokenizer-worker.ts). Falls back to the main-thread
 * tokenizer automatically when unavailable.
 */
export function TokenizationWorkerHost() {
  const { l2Lang } = useLanguage();
  const webViewRef = useRef<WebView>(null);
  const [html, setHtml] = useState<string | null>(null);

  // Resolve the L2 code that drives dict-based segmentation (Chinese etc.):
  // the exact config key, or its base code (e.g. zh-Hans → zh).
  const dictSegL2 = useMemo(() => {
    const code = l2Lang.code;
    if (TOKENIZER_CONFIG[code]?.needsDictSegmentation) return code;
    const base = baseCode(code);
    return TOKENIZER_CONFIG[base]?.needsDictSegmentation ? base : null;
  }, [l2Lang.code]);

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
    void warmTokenizationWorker();
  }, []);

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    handleTokenizationWorkerMessage(event.nativeEvent.data);
  }, []);

  const handleError = useCallback((event: { nativeEvent?: { description?: string } }) => {
    logwarn('[tokenizer-worker] WebView error:', event.nativeEvent?.description ?? 'unknown');
    markTokenizationWorkerFailed();
  }, []);

  // Warm the dict-segmentation worker for the active L2.
  useEffect(() => {
    // The WebView mounts only after the page HTML is ready — warming before
    // that fails instantly on "WebView not attached".
    if (!dictSegL2 || !html) return;
    void warmTokenizationWorkerDict(dictSegL2);
  }, [dictSegL2, html]);

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
