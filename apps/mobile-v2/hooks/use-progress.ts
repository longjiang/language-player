import { useState, useEffect, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';

const STORAGE_KEY = 'zthProgress';

interface L2Progress {
  level?: number;
  time?: number;
  weeklyHours?: number;
}

type ProgressStore = Record<string, L2Progress>;

export function useProgress(l2Code: string) {
  const [progress, setProgress] = useState<L2Progress>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await SecureStore.getItemAsync(STORAGE_KEY);
        if (raw) {
          const store: ProgressStore = JSON.parse(raw);
          if (store[l2Code]) setProgress(store[l2Code]!);
        }
      } catch {}
      setLoaded(true);
    })();
  }, [l2Code]);

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
    if (level !== undefined) persist({ level });
  }, [persist]);

  const setTime = useCallback((time: number) => persist({ time }), [persist]);

  return { level: progress.level, time: progress.time, loaded, setLevel, setTime };
}
