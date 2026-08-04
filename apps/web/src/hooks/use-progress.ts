'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useUserDataColumns } from '@langplayer/api-client';
import type { ProgressStore, L2Progress } from '@langplayer/shared';
import { logwarn } from '@/lib/logger';

const STORAGE_KEY = 'zthProgress'; // match Classic for migration compatibility
const SYNC_DEBOUNCE_MS = 3000;

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
 * Lightweight hook that reads the user's proficiency level for a given L2
 * from localStorage ONLY — no cloud fetch, no sync.
 */
export function useProgressLevel(l2Code: string): number | undefined {
  const [level, setLevel] = useState<number | undefined>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const store: ProgressStore = JSON.parse(raw);
        return parseLevel(store[l2Code]?.level);
      }
    } catch { /* corrupted */ }
    return undefined;
  });

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          const store: ProgressStore = JSON.parse(e.newValue);
          setLevel(parseLevel(store[l2Code]?.level));
        } catch { /* ignore */ }
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [l2Code]);

  return level;
}

/**
 * Per-L2 learning progress (SPEC-039 5.2 row API).
 *
 * - localStorage first (offline-capable)
 * - Authenticated: hydrate from GET /progress (server wins for level, max time)
 * - Changes: localStorage immediately + debounced PUT /progress for this L2
 */
export function useProgress(l2Code: string) {
  const { status } = useSession();
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
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const store: ProgressStore = JSON.parse(raw);
      const entry = store[l2Code];
      if (entry) {
        await putProgress(l2Code, {
          level: parseLevel(entry.level),
          time: entry.time,
          hours: entry.hours,
          weeklyHours: entry.weeklyHours,
        });
      }
    } catch (err) {
      logwarn('[progress] Cloud sync failed:', err);
    } finally {
      isSyncing.current = false;
    }
  }, [l2Code, putProgress]);

  // ── Load from localStorage on mount ──
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const store: ProgressStore = JSON.parse(raw);
        const entry = store[l2Code];
        if (entry) {
          setProgress({ ...entry, level: parseLevel(entry.level) });
        }
      }
    } catch { /* corrupted data */ }
    setLoaded(true);
  }, [l2Code]);

  // ── Authenticated: hydrate from the row API ──
  useEffect(() => {
    if (status !== 'authenticated' || !loaded || cloudLoaded.current) return;
    cloudLoaded.current = true;
    let cancelled = false;
    (async () => {
      try {
        const res = await getProgress();
        if (cancelled) return;
        const cloud = res.progress ?? {};
        const raw = localStorage.getItem(STORAGE_KEY);
        const local: ProgressStore = raw ? JSON.parse(raw) : {};
        const merged: ProgressStore = { ...local };
        for (const [code, cloudEntry] of Object.entries(cloud)) {
          if (!cloudEntry) continue;
          const localEntry = local[code];
          merged[code] = {
            level: parseLevel(cloudEntry.level) ?? (localEntry ? parseLevel(localEntry.level) : undefined),
            time: Math.max(cloudEntry.time ?? 0, localEntry?.time ?? 0),
            weeklyHours: cloudEntry.weeklyHours ?? localEntry?.weeklyHours,
          };
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
        const currentEntry = merged[l2Code];
        if (currentEntry) {
          setProgress({ ...currentEntry, level: parseLevel(currentEntry.level) });
        }
      } catch (err) {
        logwarn('[progress] Could not load from server:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [status, l2Code, loaded, getProgress]);

  // ── Persist to localStorage + schedule row sync ──
  const persist = useCallback(
    (updates: Partial<L2Progress>) => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const store: ProgressStore = raw ? JSON.parse(raw) : {};
        store[l2Code] = { ...store[l2Code], ...updates };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
        setProgress((prev) => ({ ...prev, ...updates }));
      } catch { /* quota exceeded */ }

      if (status !== 'authenticated') return;
      if (syncTimer.current) clearTimeout(syncTimer.current);
      syncTimer.current = setTimeout(syncToCloud, SYNC_DEBOUNCE_MS);
    },
    [l2Code, status, syncToCloud],
  );

  const setLevel = useCallback(
    (level: number | undefined) => {
      if (level !== undefined) persist({ level });
    },
    [persist],
  );

  const setTime = useCallback((time: number) => persist({ time }), [persist]);

  const setWeeklyHours = useCallback(
    (weeklyHours: number) => persist({ weeklyHours }),
    [persist],
  );

  return {
    level: parseLevel(progress.level),
    time: progress.time ?? 0,
    weeklyHours: progress.weeklyHours,
    loaded,
    setLevel,
    setTime,
    setWeeklyHours,
  };
}
