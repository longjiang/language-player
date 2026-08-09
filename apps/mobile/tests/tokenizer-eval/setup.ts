/**
 * SPEC-058 eval setup — global-safe mocks and Node shims.
 *
 * The suite tests the deterministic main-thread local fallback chain only.
 * The WebView worker path is owned by E2E (SPEC-023), so it is mocked to
 * "not available" here.
 */
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { vi } from 'vitest';

// kuromoji-ko's bundled dist calls bare `require('pako')` from ESM, which is
// undefined in Node ESM. Provide it via the global so the stock builder works
// under vitest (SPEC-058 Phase 0 spike).
(globalThis as any).require = createRequire(import.meta.url);

// kuromoji-ko's DictionaryLoader reads local data packs via fetch() (its Node
// fs branch is patched out for Hermes compatibility). Route non-http(s)
// fetches to node:fs so the fixture packs load under plain Node.
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input: any, init?: any) => {
  const s = String(input);
  if (s.startsWith('http://') || s.startsWith('https://')) {
    return originalFetch(input, init);
  }
  const p = s.startsWith('file://') ? fileURLToPath(s) : s;
  const data = await readFile(p);
  return new Response(
    new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)),
  );
};

vi.mock('@/lib/api-url', () => ({ PYTHON_API_URL: 'http://localhost:5001' }));
vi.mock('@/lib/offline-mode', () => ({ isOfflineModeEnabled: () => true }));
vi.mock('@/lib/tokenizer-worker', () => ({
  tokenizeJapaneseInWorker: async () => null,
  tokenizeDictSegInWorker: async () => null,
  resetDictWorker: () => {},
  attachTokenizationWebView: () => {},
  isTokenizationWorkerReady: () => false,
}));
