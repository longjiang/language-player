'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useUserData } from '@langplayer/api-client';
import type { ProgressStore, L2Progress } from '@langplayer/shared';

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
 * Hook for managing per-L2 learning progress (level, time, etc.).
 *
 * Data flow:
 *   1. Load from localStorage on mount (instant, offline-capable)
 *   2. If authenticated, load from cloud user_data.progress → merge into localStorage
 *   3. On setLevel, persist to localStorage immediately + debounced cloud sync
 *
 * Usage:
 *   const { level, setLevel, time } = useProgress(l2.code);
 *   setLevel(3); // HSK 3, A2, JLPT N4, etc.
 */
export function useProgress(l2Code: string) {
  const { status } = useSession();
  const { getUserData, syncProgress } = useUserData();
  const [progress, setProgress] = useState<L2Progress>({});
  const [loaded, setLoaded] = useState(false);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSyncing = useRef(false);
  const cloudLoaded = useRef(false);

  // ── Helper: sync full progress store to cloud ──
  const syncToCloud = useCallback(async () => {
    if (isSyncing.current) return;
    isSyncing.current = true;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) { isSyncing.current = false; return; }
      await syncProgress(raw);
    } catch (err) {
      console.warn('[progress] Cloud sync failed:', err);
    } finally {
      isSyncing.current = false;
    }
  }, [syncProgress]);

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

  // ── On login, load from cloud and merge ──
  useEffect(() => {
    if (status !== 'authenticated' || cloudLoaded.current) return;

    const loadFromCloud = async () => {
      try {
        const data = await getUserData();
        if (!data?.progress) return;

        const cloud: ProgressStore = JSON.parse(data.progress);
        const entry = cloud[l2Code];
        if (!entry) return;

        // Merge cloud data into localStorage (cloud wins for level, local wins for time)
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

        // Update state for current L2
        const currentEntry = merged[l2Code];
        if (currentEntry) {
          setProgress({ ...currentEntry, level: parseLevel(currentEntry.level) });
        }
      } catch (err) {
        console.warn('[progress] Could not load from cloud:', err);
      }
      cloudLoaded.current = true;
    };
    loadFromCloud();
  }, [status, l2Code, getUserData]);

  // ── Persist to localStorage + schedule cloud sync ──
  const persist = useCallback(
    (updates: Partial<L2Progress>) => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const store: ProgressStore = raw ? JSON.parse(raw) : {};
        store[l2Code] = { ...store[l2Code], ...updates };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
        setProgress((prev) => ({ ...prev, ...updates }));
      } catch { /* quota exceeded */ }

      // Debounced cloud sync (only when authenticated)
      if (status !== 'authenticated') return;
      if (syncTimer.current) clearTimeout(syncTimer.current);
      syncTimer.current = setTimeout(syncToCloud, SYNC_DEBOUNCE_MS);
    },
    [l2Code, status, syncToCloud],
  );

  const setLevel = useCallback(
    (level: number | undefined) => {
      if (level !== undefined) {
        persist({ level });
      }
    },
    [persist],
  );

  const setTime = useCallback(
    (time: number) => {
      persist({ time });
    },
    [persist],
  );

  const setWeeklyHours = useCallback(
    (weeklyHours: number) => {
      persist({ weeklyHours });
    },
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
