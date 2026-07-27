import { useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';

const STORAGE_KEY = 'zthProgress';

/** Module-level cache: l2Code → parsed proficiency level.
 *  Avoids repeated SecureStore reads when many TokenizedText instances
 *  mount simultaneously (e.g., FlatList renders 10+ subtitle lines).
 *  Level changes are rare — user must navigate to settings and back,
 *  which causes a full page remount and fresh cache reads. */
const levelCache = new Map<string, number | undefined>();

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
  const [level, setLevel] = useState<number | undefined>(
    () => levelCache.get(l2Code), // try cache synchronously
  );

  useEffect(() => {
    // Already cached — skip the async read
    if (levelCache.has(l2Code)) return;

    let cancelled = false;
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
