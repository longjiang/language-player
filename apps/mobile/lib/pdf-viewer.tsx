import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import { log, logwarn } from '@/lib/logger';

export interface PdfOutlineItem {
  title: string;
  /** 1-based page number the entry points to. */
  page: number;
  children?: PdfOutlineItem[];
}

export interface PdfViewerInfo {
  pageCount: number;
  outline: PdfOutlineItem[];
}

export interface PdfViewerHandle {
  /** Render one page to a PNG data URL (scale ≥ 1 for OCR, ~0.5 for thumbs). */
  renderPage: (page: number, scale?: number) => Promise<string | null>;
  /** Page count + outline once the document has loaded. */
  info: PdfViewerInfo | null;
}

const pendingCbs = new Map<string, (url: string | null) => void>();
let htmlTemplateCache: string | null = null;

/** Read a bundled asset (pdf.min.mjs / pdf.worker.min.mjs) as text. */
async function readAssetSource(module: number): Promise<string> {
  const asset = Asset.fromModule(module);
  await asset.downloadAsync();
  if (!asset.localUri) throw new Error('pdf.js asset not downloaded');
  return FileSystem.readAsStringAsync(asset.localUri);
}

/** btoa in chunks so very large module sources don't overflow the stack. */
function base64EncodeChunked(s: string): string {
  const parts = s.match(/.{1,32768}/g) ?? [s];
  return parts.map((c) => btoa(c)).join('');
}

/**
 * Build the WebView HTML that hosts pdf.js and renders pages on request.
 * pdf.js (ESM) and its worker are inlined as base64 data: URLs so the module
 * can be imported without a server; the PDF itself is inlined the same way.
 */
export async function buildPdfViewerHtml(pdfBase64: string): Promise<string> {
  if (!htmlTemplateCache) {
    log('[pdf] building pdf.js WebView template');
    const [pdfjsSrc, workerSrc] = await Promise.all([
      readAssetSource(require('@/assets/pdf/pdf.min.mjs')),
      readAssetSource(require('@/assets/pdf/pdf.worker.min.mjs')),
    ]);
    const pdfjsB64 = base64EncodeChunked(pdfjsSrc);
    const workerB64 = base64EncodeChunked(workerSrc);
    htmlTemplateCache = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body><script type="module">
const pdfjs = await import('data:text/javascript;base64,${pdfjsB64}');
pdfjs.GlobalWorkerOptions.workerSrc = 'data:text/javascript;base64,${workerB64}';
const bytes = Uint8Array.from(atob('__PDF_B64__'), (c) => c.charCodeAt(0));
let doc;
try {
  doc = await pdfjs.getDocument({ data: bytes }).promise;
} catch (e) {
  window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', error: String(e) }));
}
let outline = [];
try {
  const destPage = async (d) => {
    try {
      const r = await doc.getDestination(d);
      if (!Array.isArray(r) || !r[0] || typeof r[0] !== 'object') return 1;
      const i = await doc.getPageIndex(r[0]);
      return i + 1;
    } catch { return 1; }
  };
  const walk = async (items) => {
    const out = [];
    for (const it of items || []) {
      const node = { title: it.title, page: await destPage(it.dest) };
      if (it.items && it.items.length) node.children = await walk(it.items);
      out.push(node);
    }
    return out;
  };
  outline = await walk(await doc.getOutline());
} catch (e) {}
window.__pdf = doc;
window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready', pageCount: doc.numPages, outline }));
window.__renderPage = async (pageNum, scale) => {
  try {
    const page = await doc.getPage(pageNum);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    return canvas.toDataURL('image/png');
  } catch (e) {
    return null;
  }
};
</script></body></html>`;
  }
  return htmlTemplateCache.replace('__PDF_B64__', pdfBase64);
}

/**
 * Hidden WebView hosting pdf.js for a locally stored PDF. Exposes
 * `renderPage(page, scale)` for thumbnails and the vision-OCR page image.
 */
export const PdfViewer = forwardRef<PdfViewerHandle, {
  uri: string;
  onInfo?: (info: PdfViewerInfo) => void;
  onError?: (error: string) => void;
}>(({ uri, onInfo, onError }, ref) => {
  const webviewRef = useRef<WebView>(null);
  const [html, setHtml] = useState<string | null>(null);
  const readyRef = useRef(false);
  const infoRef = useRef<PdfViewerInfo | null>(null);
  const webviewKey = useRef(0);

  useEffect(() => {
    let cancelled = false;
    readyRef.current = false;
    infoRef.current = null;
    webviewKey.current += 1; // force a fresh WebView per document
    (async () => {
      try {
        const b64 = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const built = await buildPdfViewerHtml(b64);
        if (!cancelled) setHtml(built);
      } catch (err) {
        logwarn('[pdf] viewer init failed:', (err as Error)?.message ?? err);
        if (!cancelled) onError?.((err as Error)?.message ?? String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uri]);

  const onMessage = useCallback((event: { nativeEvent: { data: string } }) => {
    let msg: { type?: string; pageCount?: number; outline?: PdfOutlineItem[]; page?: number; url?: string | null; error?: string };
    try {
      msg = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    if (msg.type === 'ready') {
      readyRef.current = true;
      infoRef.current = { pageCount: msg.pageCount ?? 1, outline: msg.outline ?? [] };
      log(`[pdf] ready pages=${infoRef.current.pageCount} outline=${(msg.outline ?? []).length}`);
      onInfo?.(infoRef.current);
    } else if (msg.type === 'page') {
      const key = String(msg.page ?? '');
      const cb = pendingCbs.get(key);
      if (cb) {
        pendingCbs.delete(key);
        cb(msg.url ?? null);
      }
    } else if (msg.type === 'error') {
      logwarn('[pdf] viewer error:', msg.error);
      onError?.(msg.error ?? 'unknown');
      for (const cb of pendingCbs.values()) cb(null);
      pendingCbs.clear();
    }
  }, [onInfo, onError]);

  useImperativeHandle(ref, () => ({
    renderPage: (page: number, scale = 1.5) =>
      new Promise<string | null>((resolve) => {
        const wv = webviewRef.current;
        if (!readyRef.current || !wv) {
          resolve(null);
          return;
        }
        pendingCbs.set(String(page), resolve);
        wv.injectJavaScript(
          `window.__renderPage(${page}, ${scale}).then(u => window.ReactNativeWebView.postMessage(JSON.stringify({type:'page', page:${page}, url:u}))); true;`,
        );
      }),
    get info() {
      return infoRef.current;
    },
  }), []);

  if (!html) return null;
  return (
    <WebView
      key={webviewKey.current}
      ref={webviewRef}
      originWhitelist={['*']}
      source={{ html, baseUrl: 'about:blank' }}
      onMessage={onMessage}
      javaScriptEnabled
      domStorageEnabled
      style={styles.hidden}
    />
  );
});
PdfViewer.displayName = 'PdfViewer';

const styles = StyleSheet.create({
  hidden: { position: 'absolute', width: 1, height: 1, opacity: 0 },
});
