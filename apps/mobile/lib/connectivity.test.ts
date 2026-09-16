import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Connectivity decides whether the app tells the user it is offline
 * (SPEC-053). These tests pin the 2026-09-16 fix: an unreachable *backend*
 * must never be reported as "this device has no network", and NetInfo's
 * China-blocked default reachability check must not flip the state either.
 */

type NetInfoState = { isConnected: boolean | null; isInternetReachable: boolean | null; type?: string };

const netInfoListeners: Array<(s: NetInfoState) => void> = [];
const appStateListeners: Array<(s: string) => void> = [];
let fetchImpl: () => Promise<{ ok: boolean; status: number }>;

vi.mock('@react-native-community/netinfo', () => ({
  default: {
    addEventListener: (cb: (s: NetInfoState) => void) => {
      netInfoListeners.push(cb);
      return () => {};
    },
    configure: () => {},
  },
}));

vi.mock('react-native', () => ({
  AppState: {
    addEventListener: (_event: string, cb: (s: string) => void) => {
      appStateListeners.push(cb);
      return { remove: () => {} };
    },
  },
}));

vi.mock('@/lib/api-url', () => ({ PYTHON_API_URL: 'http://api.test' }));
vi.mock('@/lib/logger', () => ({ log: () => {}, logwarn: () => {}, logerr: () => {} }));

globalThis.fetch = (() => fetchImpl()) as unknown as typeof fetch;

/** Fresh module instance (the module keeps singleton state). */
async function loadConnectivity() {
  vi.resetModules();
  netInfoListeners.length = 0;
  appStateListeners.length = 0;
  return await import('./connectivity');
}

/** Let pending promises (the API probe) settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  fetchImpl = async () => ({ ok: true, status: 200 });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('connectivity (SPEC-053)', () => {
  it('stays online when the device is connected, even if the API is down', async () => {
    // The backend being unreachable is a sync problem, not a device problem.
    fetchImpl = async () => {
      throw new Error('Could not connect to the server');
    };
    const c = await loadConnectivity();
    c.startConnectivity();
    await settle();

    netInfoListeners.forEach((cb) =>
      cb({ isConnected: true, isInternetReachable: false, type: 'wifi' }),
    );
    await settle();

    expect(c.getConnectivity()).toBe('online');
  });

  it('ignores NetInfo’s internet-reachability check (a blocked probe host)', async () => {
    // `isInternetReachable: false` with `isConnected: true` is exactly what a
    // mainland-China network produces (clients3.google.com is blocked); the
    // device is fine and must be reported as online.
    fetchImpl = async () => ({ ok: true, status: 200 });
    const c = await loadConnectivity();
    c.startConnectivity();
    await settle();

    netInfoListeners.forEach((cb) =>
      cb({ isConnected: true, isInternetReachable: false, type: 'wifi' }),
    );
    await settle();

    expect(c.getConnectivity()).toBe('online');
  });

  it('reports offline after a native disconnect (debounced)', async () => {
    vi.useFakeTimers();
    fetchImpl = async () => {
      throw new Error('offline');
    };
    const c = await loadConnectivity();
    c.startConnectivity();

    netInfoListeners.forEach((cb) => cb({ isConnected: false, isInternetReachable: false }));
    expect(c.getConnectivity()).not.toBe('offline'); // debounce window
    vi.advanceTimersByTime(2000);

    expect(c.getConnectivity()).toBe('offline');
  });

  it('falls back to the API probe only while the native signal is missing', async () => {
    // Unknown native signal + reachable API → online.
    fetchImpl = async () => ({ ok: true, status: 200 });
    const c = await loadConnectivity();
    c.startConnectivity();
    await settle();
    expect(c.getConnectivity()).toBe('online');

    // Unknown native signal + unreachable API → offline.
    fetchImpl = async () => {
      throw new Error('Could not connect to the server');
    };
    const c2 = await loadConnectivity();
    c2.startConnectivity();
    await settle();
    expect(c2.getConnectivity()).toBe('offline');
  });

  it('comes back online on the next native signal without waiting for the probe', async () => {
    fetchImpl = async () => {
      throw new Error('Could not connect to the server');
    };
    const c = await loadConnectivity();
    c.startConnectivity();
    await settle();
    expect(c.getConnectivity()).toBe('offline');

    netInfoListeners.forEach((cb) =>
      cb({ isConnected: true, isInternetReachable: null, type: 'wifi' }),
    );
    expect(c.getConnectivity()).toBe('online');
  });
});
