/**
 * Mobile wiring for the shared SRS test-generation manager
 * (`packages/utils/src/srs-test-manager.ts`): a singleton with the mobile
 * transport (POST /chatgpt via @langplayer/api-client) and an
 * AsyncStorage-backed test cache.
 */
import { SrsTestManager, type SrsTestTransport } from '@langplayer/utils';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { srsLogger } from '@/lib/logger';
import { isOfflineModeEnabled } from '@/lib/offline-mode';
import { getConnectivity } from '@/lib/connectivity';

const { log } = srsLogger;
const CACHE_KEY = 'lp:srs-test-cache';

const transport: SrsTestTransport = {
  async generate(prompt: string, options: { cache: boolean }) {
    // Offline, don't even try: the request would be rejected by the Offline
    // Mode gate or hang until the fetch times out. Failing immediately hands
    // the request to the programmatic fallback (SPEC-066 § "Offline test
    // generation") without making the learner wait.
    if (isOfflineModeEnabled() || getConnectivity() === 'offline') {
      throw new Error('Offline — no test question was requested from the server');
    }
    const { apiClient } = await import('@langplayer/api-client');
    const payload = await apiClient.post(
      '/chatgpt',
      { prompt, cache: options.cache, max_tokens: 500 },
      options.cache ? undefined : { headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' } },
    );
    return String((payload as { response?: unknown })?.response ?? '');
  },
};

let manager: SrsTestManager | null = null;

/** Lazy singleton — call from effects/handlers, never during render. */
export function getSrsTestManager(): SrsTestManager {
  if (!manager) {
    manager = new SrsTestManager(transport, {
      storage: {
        async load() {
          try {
            const raw = await AsyncStorage.getItem(CACHE_KEY);
            return raw ? JSON.parse(raw) : {};
          } catch {
            return {};
          }
        },
        async save(entries) {
          try {
            await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(entries));
          } catch {
            // Best-effort persistence; the in-memory cache still works.
          }
        },
      },
      onLog: (event, data) => log(`[srs-test] ${event}`, data),
    });
  }
  return manager;
}
