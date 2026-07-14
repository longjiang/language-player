'use client';

import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'zthProgress'; // match Classic for migration compatibility

interface L2Progress {
  level?: number;
  time?: number;
  weeklyHours?: number;
  certifications?: { name: string; date: string }[];
}

type ProgressStore = Record<string, L2Progress>;

/**
 * Hook for managing per-L2 learning progress (level, time, etc.).
 * Stored in localStorage under 'zthProgress', matching Classic's format.
 *
 * Usage:
 *   const { level, setLevel, time } = useProgress(l2.code);
 *   setLevel(3); // HSK 3, A2, JLPT N4, etc.
 */
export function useProgress(l2Code: string) {
  const [progress, setProgress] = useState<L2Progress>({});
  const [loaded, setLoaded] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const store: ProgressStore = JSON.parse(raw);
        if (store[l2Code]) {
          setProgress(store[l2Code]!);
        }
      }
    } catch { /* corrupted data */ }
    setLoaded(true);
  }, [l2Code]);

  // Persist helper
  const persist = useCallback(
    (updates: Partial<L2Progress>) => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const store: ProgressStore = raw ? JSON.parse(raw) : {};
        store[l2Code] = { ...store[l2Code], ...updates };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
        setProgress((prev) => ({ ...prev, ...updates }));
      } catch { /* quota exceeded */ }
    },
    [l2Code],
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
    level: progress.level,
    time: progress.time ?? 0,
    weeklyHours: progress.weeklyHours,
    loaded,
    setLevel,
    setTime,
    setWeeklyHours,
  };
}
