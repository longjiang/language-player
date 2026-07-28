import { useState, useEffect, useRef } from 'react';
import * as SecureStore from 'expo-secure-store';

const STORAGE_KEY = 'zthProgress';

/** Module-level cache: l2Code → parsed proficiency level.
 *  Avoids repeated SecureStore reads when many TokenizedText instances
 *  mount simultaneously (e.g., FlatList renders 10+ subtitle lines).
 *  Level changes are rare — user must navigate to settings and back,
 *  which causes a full page remount and fresh cache reads. */
const levelCache = new Map<string, number | undefined>();
/** Incremented on invalidation so all useProgressLevel hooks re-read SecureStore. */
let cacheGeneration = 0;

/** Clear the module-level cache for the given l2Code (or all if omitted).
 *  Call this after writing a new proficiency level so that future
 *  useProgressLevel() calls re-read from SecureStore. */
export function invalidateLevelCache(l2Code?: string): void {
  cacheGeneration++;
  if (l2Code) {
    levelCache.delete(l2Code);
  } else {
    levelCache.clear();
  }
}

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
 * Uses a module-level cache so that only the first instance for a given l2Code
 * hits SecureStore; subsequent instances return the cached value immediately.
 *
 * Cloud sync is handled separately by useProgress() at the page/layout level.
 */
export function useProgressLevel(l2Code: string): number | undefined {
  const cacheGenRef = useRef(cacheGeneration);
  const [level, setLevel] = useState<number | undefined>(
    () => levelCache.get(l2Code), // try cache synchronously
  );

  useEffect(() => {
    // Only skip if cache is populated AND generation hasn't changed
    if (levelCache.has(l2Code) && cacheGenRef.current === cacheGeneration) return;

    let cancelled = false;
    cacheGenRef.current = cacheGeneration;
    (async () => {
      try {
        const raw = await SecureStore.getItemAsync(STORAGE_KEY);
        if (raw && !cancelled) {
          const store = JSON.parse(raw);
          const parsed = parseLevel(store[l2Code]?.level);
          levelCache.set(l2Code, parsed);
          if (!cancelled) setLevel(parsed);
        } else if (!cancelled) {
          levelCache.set(l2Code, undefined);
        }
      } catch {
        levelCache.set(l2Code, undefined);
      }
    })();
    return () => { cancelled = true; };
  }, [l2Code]);

  return level;
}
