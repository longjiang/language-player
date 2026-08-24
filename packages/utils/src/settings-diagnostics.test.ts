import { describe, it, expect } from 'vitest';
import {
  pushSettingsDiag,
  readSettingsDiag,
  SETTINGS_DIAG_KEY,
  type KeyValueStorage,
} from './settings-diagnostics';

/** In-memory storage adapter for tests. */
function memoryStorage(): KeyValueStorage & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    getItem: async (key) => store.get(key) ?? null,
    setItem: async (key, value) => {
      store.set(key, value);
    },
  };
}

describe('settings diagnostics ring buffer', () => {
  it('records events under a single key and reads them back', async () => {
    const storage = memoryStorage();
    await pushSettingsDiag(storage, 'no local blob — starting from defaults');
    await pushSettingsDiag(storage, 'hydrate APPLY cloud', { cloudTs: '2026-08-24T00:00:00Z' });

    const events = await readSettingsDiag(storage);
    expect(events).toHaveLength(2);
    expect(events[0]!.msg).toBe('no local blob — starting from defaults');
    expect(events[1]!.msg).toBe('hydrate APPLY cloud');
    expect(events[1]!.data).toEqual({ cloudTs: '2026-08-24T00:00:00Z' });
    expect(typeof events[0]!.t).toBe('string');
  });

  it('caps the history at MAX_EVENTS (60) — oldest events are dropped', async () => {
    const storage = memoryStorage();
    for (let i = 0; i < 70; i++) {
      await pushSettingsDiag(storage, `event ${i}`);
    }
    const events = await readSettingsDiag(storage);
    expect(events).toHaveLength(60);
    expect(events[0]!.msg).toBe('event 10');
    expect(events[59]!.msg).toBe('event 69');
  });

  it('never throws on corrupt stored data', async () => {
    const storage = memoryStorage();
    storage.store.set(SETTINGS_DIAG_KEY, '{not json');
    await expect(readSettingsDiag(storage)).resolves.toEqual([]);
    // push still works after corruption (starts a fresh history)
    await pushSettingsDiag(storage, 'recovered');
    const events = await readSettingsDiag(storage);
    expect(events).toHaveLength(1);
    expect(events[0]!.msg).toBe('recovered');
  });

  it('never throws when the storage adapter itself fails', async () => {
    const broken: KeyValueStorage = {
      getItem: async () => {
        throw new Error('storage unavailable');
      },
      setItem: async () => {
        throw new Error('storage unavailable');
      },
    };
    await expect(pushSettingsDiag(broken, 'boom')).resolves.toBeUndefined();
    await expect(readSettingsDiag(broken)).resolves.toEqual([]);
  });
});
