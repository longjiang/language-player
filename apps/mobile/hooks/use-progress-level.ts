import { useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';

const STORAGE_KEY = 'zthProgress';

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
 * from SecureStore. No cloud sync, no writes. Safe to call in repeated child
 * components (e.g., TokenizedText per subtitle line).
 *
 * Cloud sync is handled separately by useProgress() at the page/layout level.
 */
export function useProgressLevel(l2Code: string): number | undefined {
  const [level, setLevel] = useState<number | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await SecureStore.getItemAsync(STORAGE_KEY);
        if (raw && !cancelled) {
          const store = JSON.parse(raw);
          setLevel(parseLevel(store[l2Code]?.level));
        }
      } catch {
        /* corrupted — ignore */
      }
    })();
    return () => { cancelled = true; };
  }, [l2Code]);

  return level;
}
