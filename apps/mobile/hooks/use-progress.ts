import { useState, useEffect, useCallback, useRef } from 'react';
import * as SecureStore from 'expo-secure-store';
import { invalidateLevelCache } from './use-progress-level';
import { useAuth } from '@/contexts/AuthContext';
import { useUserDataColumns } from '@langplayer/api-client';
import { logwarn } from '@/lib/logger';

const STORAGE_KEY = 'zthProgress'; // match Classic for migration compatibility
const SYNC_DEBOUNCE_MS = 3000;

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
 * Per-L2 learning progress (SPEC-039 5.2 row API).
 *
 * - SecureStore first (offline-capable)
 * - Authenticated: hydrate from GET /progress (server wins for level, max time)
 * - Changes: SecureStore immediately + debounced PUT /progress for this L2
 */
export function useProgress(l2Code: string) {
  const { user } = useAuth();
  const { getProgress, putProgress } = useUserDataColumns();
  const [progress, setProgress] = useState<L2Progress>({});
  const [loaded, setLoaded] = useState(false);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSyncing = useRef(false);
  const cloudLoaded = useRef(false);

  const syncToCloud = useCallback(async () => {
    if (isSyncing.current) return;
    isSyncing.current = true;
    try {
      const raw = await SecureStore.getItemAsync(STORAGE_KEY);
      if (!raw) return;
      const store: ProgressStore = JSON.parse(raw);
      const entry = store[l2Code];
      if (entry) {
        await putProgress(l2Code, {
          level: parseLevel(entry.level),
          time: entry.time,
          weeklyHours: entry.weeklyHours,
        });
      }
    } catch (err) {
      logwarn('[progress] Cloud sync failed:', err);
    } finally {
      isSyncing.current = false;
    }
  }, [l2Code, putProgress]);

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

  // ── Authenticated: hydrate from the row API ──
  useEffect(() => {
    if (!user || !loaded || cloudLoaded.current) return;
    cloudLoaded.current = true;
    let cancelled = false;
    (async () => {
      try {
        const res = await getProgress();
        if (cancelled) return;
        const cloud = res.progress ?? {};
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
      } catch (err) {
        logwarn('[progress] Could not load from server:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [user, l2Code, loaded, getProgress]);

  // ── Persist to SecureStore + debounced row sync ──
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

    if (!user) return;
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(syncToCloud, SYNC_DEBOUNCE_MS);
  }, [l2Code, user, syncToCloud]);

  const setLevel = useCallback((level: number | undefined) => {
    if (level !== undefined) {
      invalidateLevelCache(l2Code);
      persist({ level });
    }
  }, [persist, l2Code]);

  const setTime = useCallback((time: number) => persist({ time }), [persist]);

  return { level: parseLevel(progress.level), time: progress.time, loaded, setLevel, setTime };
}
