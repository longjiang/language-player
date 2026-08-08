/**
 * SPEC-053 Phase 2 — auto-detected connectivity (ephemeral, never persisted).
 *
 * Uses NetInfo as the primary signal, with a lightweight API health probe as
 * the fallback when the native signal is unknown. The manual Offline Mode
 * toggle stays a separate, persisted override (offline-mode.ts).
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

function publish(next: Connectivity): void {
  if (next === current) return;
  current = next;
  log(`[LP Mobile] Connectivity: ${next}`);
  for (const cb of listeners) cb(next);
}

function applyNative(isConnected: boolean | null): void {
  lastNative = isConnected;
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (isConnected === false) {
    // Debounce so a flaky network doesn't flicker between states.
    debounceTimer = setTimeout(() => publish('offline'), OFFLINE_DEBOUNCE_MS);
  } else if (isConnected === true) {
    publish('online');
  } else {
    publish('unknown');
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
      return res.ok || res.status < 500;
    } catch {
      return false;
    } finally {
      probePromise = null;
    }
  })();
  return probePromise;
}

async function probe(): Promise<void> {
  const online = await probeOnline();
  if (online) publish('online');
  else if (lastNative !== false) publish('offline');
}

let started = false;

/** Install NetInfo + AppState listeners. Idempotent. */
export function startConnectivity(): () => void {
  if (started) return () => {};
  started = true;

  const unsubNetInfo = NetInfo.addEventListener((state) => {
    const connected = state.isConnected ?? null;
    const reachable = state.isInternetReachable;
    if (reachable === false || connected === false) applyNative(false);
    else if (reachable === true || connected === true) applyNative(true);
    else applyNative(null);
  });

  const subAppState = AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      if (lastNative === true) publish('online');
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
