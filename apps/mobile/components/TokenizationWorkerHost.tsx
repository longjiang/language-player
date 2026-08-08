import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { TOKENIZER_CONFIG } from '@langplayer/shared';
import { baseCode } from '@langplayer/utils';
import { log, logwarn } from '@/lib/logger';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  attachTokenizationWebView,
  buildWorkerPageHtml,
  handleTokenizationWorkerMessage,
  markTokenizationWorkerFailed,
  tokenizeDictSegInWorker,
  tokenizeJapaneseInWorker,
  warmTokenizationWorkerDict,
  warmTokenizationWorker,
} from '@/lib/tokenizer-worker';

/** Launch self-test: proves the full RN→page→RN tokenize channel works. */
const LAUNCH_PROBE = '冬の寒さが和らぐと、春になると生物の活動が活発になる。';
// Reader-sized Chinese paragraph (鲁迅, 呐喊 — 狂人日记) so the launch probe
// exercises a realistic multi-hundred-char request, not just a short one.
const LAUNCH_PROBE_ZH = '一、\n\n　　秋天的後半夜，月亮下去了，太陽還沒有出，只剩下一片烏藍的天；除了夜遊的東西，什麼都睡著。';

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

  // Dev-only: EXPO_PUBLIC_ZH_WORKER_PROBE=1 forces the Chinese worker warm +
  // probe even when the active L2 isn't Chinese (used for offline verification
  // on simulators that have the zh dictionary but ja as the target language).
  const probeL2 = (__DEV__ && process.env.EXPO_PUBLIC_ZH_WORKER_PROBE === '1') ? 'zh' : dictSegL2;

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

  // Warm the dict-segmentation worker for the active L2 and self-test it.
  useEffect(() => {
    // The WebView mounts only after the page HTML is ready — warming before
    // that fails instantly on "WebView not attached".
    if (!probeL2 || !html) return;
    let cancelled = false;
    void (async () => {
      const ready = await warmTokenizationWorkerDict(probeL2);
      if (!ready) {
        if (!cancelled) {
          log(`[tokenizer-worker] dict worker unavailable (${probeL2}) — main-thread fallback`);
        }
        return;
      }
      const tokens = await tokenizeDictSegInWorker(LAUNCH_PROBE_ZH, probeL2);
      if (!tokens) {
        if (!cancelled) logwarn('[tokenizer-worker] dict launch probe failed — page did not reply');
        return;
      }
      if (cancelled) return;
      log(`[tokenizer-worker] 🎯 dict launch probe OK (${probeL2}) — tokens=${tokens.length}`);
      log(
        '[tokenizer-worker] 🎯 sample:',
        tokens.slice(0, 12).map((t) => `${t.text}→${t.lemmas[0]?.lemma ?? ''}`).join(' | '),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [probeL2, html]);

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
