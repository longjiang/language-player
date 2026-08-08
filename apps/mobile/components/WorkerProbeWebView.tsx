import React, { useCallback, useRef } from 'react';
import { View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { log, logwarn } from '@/lib/logger';

/**
 * Invisible WebView worker round-trip probe.
 *
 * On app launch it loads a tiny HTML page that spawns a Web Worker (from a
 * Blob URL). The native side posts a message to the page, the page forwards
 * it to the worker, the worker reverses the string and posts it back, and the
 * page relays the result to React Native via ReactNativeWebView.postMessage.
 * The result is logged to the Metro console.
 */

const PROBE_MESSAGE = 'Language Player worker round-trip';

const WORKER_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body>
<script>
(function () {
  var workerSource = [
    "self.onmessage = function (event) {",
    "  var text = String(event.data);",
    "  var reversed = Array.from(text).reverse().join('');",
    "  self.postMessage(reversed);",
    "};"
  ].join("\\n");

  var blob = new Blob([workerSource], { type: "application/javascript" });
  var workerUrl = URL.createObjectURL(blob);
  var worker = new Worker(workerUrl);

  worker.onmessage = function (event) {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(event.data);
    }
  };

  window.addEventListener("message", function (event) {
    worker.postMessage(event.data);
  });
})();
<\/script>
</body>
</html>`;

export function WorkerProbeWebView() {
  const webViewRef = useRef<WebView>(null);
  const postedRef = useRef(false);
  const repliedRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleLoadEnd = useCallback(() => {
    if (postedRef.current) {
      return;
    }
    postedRef.current = true;
    log('[WorkerProbe] posting message to invisible WebView worker:', PROBE_MESSAGE);
    webViewRef.current?.postMessage(PROBE_MESSAGE);
    timeoutRef.current = setTimeout(() => {
      if (!repliedRef.current) {
        logwarn('[WorkerProbe] no reply from WebView worker within 5s');
      }
    }, 5000);
  }, []);

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    repliedRef.current = true;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    const reversed = event.nativeEvent.data;
    log('[WorkerProbe] worker replied with reversed message:', reversed);
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
      <WebView
        ref={webViewRef}
        source={{ html: WORKER_HTML, baseUrl: 'https://langplayer-worker.local/' }}
        onLoadEnd={handleLoadEnd}
        onMessage={handleMessage}
        onError={(event) => logwarn('[WorkerProbe] WebView failed to load:', event.nativeEvent.description)}
        javaScriptEnabled
        domStorageEnabled
        originWhitelist={['*']}
        containerStyle={{ width: 0, height: 0, overflow: 'hidden' }}
        style={{ width: 0, height: 0, opacity: 0 }}
      />
    </View>
  );
}
