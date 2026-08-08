import * as SecureStore from 'expo-secure-store';
import { File, type Directory, type DownloadOptions } from 'expo-file-system';
import { log } from '@/lib/logger';

/**
 * Local-only network kill switch.
 *
 * Persisted in SecureStore (NOT in `lp_settings`, so it is never sent to
 * GET/PUT /user-settings and therefore never syncs to the user's account).
 *
 * When enabled, the gate rejects:
 *  - global `fetch()` (direct calls + `authenticatedFetch`)
 *  - `XMLHttpRequest` (the default axios adapter used by apiClient in RN)
 *  - `File.downloadFileAsync()` (offline dictionary / tokenizer packs)
 */

const OFFLINE_MODE_KEY = 'lp_offline_mode';

let offlineModeEnabled = false;
let gateInstalled = false;
let initPromise: Promise<boolean> | null = null;
let persistChain: Promise<void> = Promise.resolve();

export class OfflineModeError extends Error {
  constructor() {
    super('Network requests are blocked by Offline Mode');
    this.name = 'OfflineModeError';
  }
}

function rejectOffline(): Promise<never> {
  return Promise.reject(new OfflineModeError());
}

function installGate() {
  if (gateInstalled) return;
  gateInstalled = true;

  // ── fetch ──
  const globalObj = globalThis as any;
  if (typeof globalObj.fetch === 'function') {
    const originalFetch = globalObj.fetch.bind(globalObj);
    globalObj.fetch = (input: any, init?: any) => {
      if (offlineModeEnabled) return rejectOffline();
      return originalFetch(input, init);
    };
  }

  // ── XMLHttpRequest (axios adapter in React Native) ──
  if (typeof XMLHttpRequest !== 'undefined') {
    const proto = XMLHttpRequest.prototype as any;
    const originalOpen = proto.open;
    const originalSend = proto.send;

    proto.open = function (this: XMLHttpRequest, ...args: any[]) {
      if (offlineModeEnabled) throw new OfflineModeError();
      return originalOpen.apply(this, args);
    };

    proto.send = function (this: XMLHttpRequest, ...args: any[]) {
      if (offlineModeEnabled) throw new OfflineModeError();
      return originalSend.apply(this, args);
    };
  }

  // ── expo-file-system native downloads ──
  if (typeof File?.downloadFileAsync === 'function') {
    const originalDownload = File.downloadFileAsync.bind(File);
    File.downloadFileAsync = (
      url: string,
      destination: Directory | File,
      options?: DownloadOptions,
    ) => {
      if (offlineModeEnabled) return rejectOffline();
      return originalDownload(url, destination, options);
    };
  }
}

/** Whether the network kill switch is currently active. */
export function isOfflineModeEnabled(): boolean {
  return offlineModeEnabled;
}

/**
 * Load the persisted value and install the gate.
 * Idempotent — safe to call from both the root layout and settings hook.
 */
export function initOfflineMode(): Promise<boolean> {
  installGate();
  if (!initPromise) {
    initPromise = SecureStore.getItemAsync(OFFLINE_MODE_KEY)
      .then((raw) => {
        offlineModeEnabled = raw === 'true';
        return offlineModeEnabled;
      })
      .catch(() => {
        offlineModeEnabled = false;
        return false;
      });
  }
  return initPromise;
}

/** Enable/disable the kill switch and persist it locally (never syncs). */
export function setOfflineModeEnabled(enabled: boolean): Promise<void> {
  offlineModeEnabled = enabled;
  installGate();
  log(`[LP Mobile] Offline Mode ${enabled ? 'enabled' : 'disabled'}`);
  // Serialize writes so a fast toggle can't persist out of order.
  persistChain = persistChain
    .then(() => SecureStore.setItemAsync(OFFLINE_MODE_KEY, enabled ? 'true' : 'false'))
    .catch(() => {
      // Non-fatal: the in-memory gate still applies for this session.
    });
  return persistChain;
}
