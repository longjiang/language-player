/**
 * SPEC-053 Phase 2 — auto-detected connectivity (ephemeral, never persisted).
 *
 * Two different questions are answered here, and conflating them is a bug:
 *
 * 1. **Does the device have a network?** — the native NetInfo signal
 *    (`isConnected`). This is what `connectivity` reports, and it is what the
 *    offline UI (`effectiveOffline`) is about.
 * 2. **Can we reach our backend?** — the API probe below. A backend that is
 *    down, restarting, or blocked says nothing about the device, so a failed
 *    probe must never flip the app to "offline" while the device is connected
 *    (it belongs in the sync status as an error instead).
 *
 * NetInfo's own `isInternetReachable` is deliberately NOT trusted: it is an
 * HTTP check against `clients3.google.com/generate_204`, a host that mainland
 * China blocks (ADR-0046), so on a perfectly good connection it reports
 * "no internet" and the whole app claimed to be offline. `isConnected` comes
 * from the OS and is accurate everywhere.
 *
 * The manual Offline Mode toggle stays a separate, persisted override
 * (offline-mode.ts).
 *
 * These decisions are logged on the default channel (not the `boot` aspect,
 * which is off unless re-enabled at runtime) because "why does the app think
 * it is offline?" is not diagnosable from anything else.
 */

import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';
import { PYTHON_API_URL } from '@/lib/api-url';
import { log } from '@/lib/logger';

export type Connectivity = 'online' | 'offline' | 'unknown';

let current: Connectivity = 'unknown';
let lastNative: boolean | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let probePromise: Promise<boolean> | null = null;
let lastProbeAt = 0;

const listeners = new Set<(c: Connectivity) => void>();
const PROBE_COOLDOWN_MS = 5000;
const OFFLINE_DEBOUNCE_MS = 1500;

export function getConnectivity(): Connectivity {
  return current;
}

export function subscribeConnectivity(
  cb: (c: Connectivity) => void,
): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function publish(next: Connectivity, reason: string): void {
  if (next === current) return;
  current = next;
  log(`[connectivity] ${next}`, { reason, native: lastNative });
  for (const cb of listeners) cb(next);
}

function applyNative(isConnected: boolean | null, detail: Record<string, unknown> = {}): void {
  lastNative = isConnected;
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (isConnected === false) {
    // Debounce so a flaky network doesn't flicker between states.
    log('[connectivity] native signal: no connection', detail);
    debounceTimer = setTimeout(
      () => publish('offline', 'native-no-connection'),
      OFFLINE_DEBOUNCE_MS,
    );
  } else if (isConnected === true) {
    log('[connectivity] native signal: connected', detail);
    publish('online', 'native-connected');
  } else {
    log('[connectivity] native signal: unknown — probing the API', detail);
    publish('unknown', 'native-unknown');
    void probe();
  }
}

/** Lightweight API health probe (cooldown-cached). */
export async function probeOnline(): Promise<boolean> {
  const now = Date.now();
  if (probePromise) return probePromise;
  if (now - lastProbeAt < PROBE_COOLDOWN_MS) {
    return current !== 'offline';
  }
  lastProbeAt = now;
  probePromise = (async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`${PYTHON_API_URL}/`, {
        method: 'HEAD',
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const online = res.ok || res.status < 500;
      log('[connectivity] API probe', { status: res.status, online });
      return online;
    } catch (e) {
      // The API is unreachable — that is a sync problem, not proof that the
      // device has no network (see the module comment).
      log('[connectivity] API probe failed', {
        error: (e as Error)?.message ?? String(e),
      });
      return false;
    } finally {
      probePromise = null;
    }
  })();
  return probePromise;
}

async function probe(): Promise<void> {
  const online = await probeOnline();
  if (online) {
    publish('online', 'api-probe');
  } else if (lastNative === null) {
    // Only the *device* question is answered here, and only while the native
    // signal is missing. A reachable-network-but-unreachable-API result is
    // reported through the sync status instead.
    publish('offline', 'api-probe-failed-no-native-signal');
  } else {
    log('[connectivity] API probe failed but the device is connected — staying online');
  }
}

let started = false;

/** Install NetInfo + AppState listeners. Idempotent. */
export function startConnectivity(): () => void {
  if (started) return () => {};
  started = true;

  // NetInfo's default reachability check fires an HTTP request at
  // `clients3.google.com/generate_204` — blocked in mainland China (ADR-0046),
  // so it fails on a healthy connection, and NetInfo then retries it every
  // `reachabilityShortTimeout`. Point that check at our own API instead: it
  // stops the doomed request, and the value it produces is ignored for the
  // device-offline decision anyway (see the module comment).
  NetInfo.configure({
    reachabilityUrl: `${PYTHON_API_URL}/`,
    reachabilityMethod: 'HEAD',
    reachabilityTest: async (response) => response.status < 500,
    reachabilityLongTimeout: 60_000,
    reachabilityShortTimeout: 30_000,
  });

  const unsubNetInfo = NetInfo.addEventListener((state) => {
    const connected = state.isConnected ?? null;
    applyNative(connected, {
      type: state.type,
      isConnected: state.isConnected,
      // Reported for diagnosis only — see the module comment.
      isInternetReachable: state.isInternetReachable,
    });
  });

  const subAppState = AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      if (lastNative === true) publish('online', 'app-foreground');
      else void probe();
    }
  });

  void probe();

  return () => {
    unsubNetInfo();
    subAppState.remove();
    started = false;
  };
}
