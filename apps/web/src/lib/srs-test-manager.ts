/**
 * Web wiring for the shared SRS test-generation manager
 * (`packages/utils/src/srs-test-manager.ts`): a singleton with the web
 * transport (POST /chatgpt via fetch) and localStorage-backed test cache.
 */
import { SrsTestManager, type SrsTestTransport } from '@langplayer/utils';
import { PYTHON_API_URL } from '@/lib/api-url';
import { log } from '@/lib/logger';

const CACHE_KEY = 'lp:srs-test-cache';

const transport: SrsTestTransport = {
  async generate(prompt: string, options: { cache: boolean }) {
    const response = await fetch(`${PYTHON_API_URL}/chatgpt`, {
      method: 'POST',
      cache: options.cache ? 'default' : 'no-store',
      headers: {
        'Content-Type': 'application/json',
        ...(options.cache ? {} : { 'Cache-Control': 'no-cache', Pragma: 'no-cache' }),
      },
      body: JSON.stringify({ prompt, cache: options.cache, max_tokens: 500 }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    return String(payload?.response ?? '');
  },
};

let manager: SrsTestManager | null = null;

/** Lazy singleton — call from effects/handlers (client-only), never during render. */
export function getSrsTestManager(): SrsTestManager {
  if (!manager) {
    manager = new SrsTestManager(transport, {
      storage: {
        load() {
          try {
            const raw = window.localStorage.getItem(CACHE_KEY);
            return raw ? JSON.parse(raw) : {};
          } catch {
            return {};
          }
        },
        save(entries) {
          try {
            window.localStorage.setItem(CACHE_KEY, JSON.stringify(entries));
          } catch {
            // Quota / private-mode failures are non-fatal; the in-memory cache still works.
          }
        },
      },
      onLog: (event, data) => log(`[SRS Test] ${event}`, data),
    });
  }
  return manager;
}
