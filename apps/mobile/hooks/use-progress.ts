import { useState, useEffect, useCallback, useRef } from 'react';
import * as SecureStore from 'expo-secure-store';
import { invalidateLevelCache } from './use-progress-level';
import { useCloudUserData } from '@/contexts/UserDataContext';

const STORAGE_KEY = 'zthProgress'; // match Classic for migration compatibility

interface L2Progress {
  level?: number | string;
  time?: number;
  weeklyHours?: number;
}

type ProgressStore = Record<string, L2Progress | null>;

/** Parse raw level value (number or numeric string) into a number, or undefined. */
function parseLevel(raw: unknown): number | undefined {
  if (typeof raw === 'number' && raw >= 1 && raw <= 7) return raw;
  if (typeof raw === 'string') {
    const n = Number(raw);
    if (n >= 1 && n <= 7) return n;
  }
  return undefined;
}

/**
 * Hook for managing per-L2 learning progress (level, time, etc.).
 *
 * Data flow:
 *   1. Load from SecureStore on mount (instant, offline-capable)
 *   2. If authenticated, merge cloud user_data.progress into SecureStore
 *      (reads from UserDataContext — no additional API call)
 *   3. On setLevel, persist to SecureStore immediately
 */
export function useProgress(l2Code: string) {
  const [progress, setProgress] = useState<L2Progress>({});
  const [loaded, setLoaded] = useState(false);
  const cloudLoaded = useRef(false);
  const { data: cloudUserData, loaded: cloudReady } = useCloudUserData();

  // ── Load from SecureStore on mount ──
  useEffect(() => {
    (async () => {
      try {
        const raw = await SecureStore.getItemAsync(STORAGE_KEY);
        if (raw) {
          const store: ProgressStore = JSON.parse(raw);
          const entry = store[l2Code];
          if (entry) {
            setProgress({ ...entry, level: parseLevel(entry.level) });
          }
        }
      } catch { /* corrupted data */ }
      setLoaded(true);
    })();
  }, [l2Code]);

  // ── On login, merge cloud progress into SecureStore ──
  // Reads from UserDataContext (fetched once by UserDataProvider) instead
  // of making an independent /user-data call.
  useEffect(() => {
    if (cloudLoaded.current || !cloudReady) return;

    const cloudProgressStr = cloudUserData?.progress;
    if (!cloudProgressStr) {
      cloudLoaded.current = true;
      return;
    }

    (async () => {
      try {
        const cloud: ProgressStore = JSON.parse(cloudProgressStr);
        if (!cloud[l2Code]) { cloudLoaded.current = true; return; }

        // Merge cloud data into SecureStore (cloud wins for level, local wins for time)
        const raw = await SecureStore.getItemAsync(STORAGE_KEY);
        const local: ProgressStore = raw ? JSON.parse(raw) : {};

        const merged: ProgressStore = { ...local };
        for (const [code, cloudEntry] of Object.entries(cloud)) {
          if (!cloudEntry) continue;
          const localEntry = local[code];
          merged[code] = {
            level: parseLevel(cloudEntry.level) ?? parseLevel(localEntry?.level),
            time: Math.max(cloudEntry.time ?? 0, localEntry?.time ?? 0),
            weeklyHours: cloudEntry.weeklyHours ?? localEntry?.weeklyHours,
          };
        }

        await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(merged));

        const currentEntry = merged[l2Code];
        if (currentEntry) {
          setProgress({ ...currentEntry, level: parseLevel(currentEntry.level) });
        }
      } catch { /* ignore */ }
      cloudLoaded.current = true;
    })();
  }, [l2Code, cloudUserData, cloudReady]);

  const persist = useCallback((updates: Partial<L2Progress>) => {
    (async () => {
      try {
        const raw = await SecureStore.getItemAsync(STORAGE_KEY);
        const store: ProgressStore = raw ? JSON.parse(raw) : {};
        store[l2Code] = { ...store[l2Code], ...updates };
        await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(store));
        setProgress((prev) => ({ ...prev, ...updates }));
      } catch {}
    })();
  }, [l2Code]);

  const setLevel = useCallback((level: number | undefined) => {
    if (level !== undefined) {
      invalidateLevelCache(l2Code);
      persist({ level });
    }
  }, [persist, l2Code]);

  const setTime = useCallback((time: number) => persist({ time }), [persist]);

  return { level: parseLevel(progress.level), time: progress.time, loaded, setLevel, setTime };
}
