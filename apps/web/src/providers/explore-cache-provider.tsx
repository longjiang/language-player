'use client';

import React, { createContext, useContext, useCallback, useRef, type ReactNode } from 'react';
import type { YouTubeVideo } from '@langplayer/shared';

interface CacheEntry {
  videos: YouTubeVideo[];
  hasMore: boolean;
  error: string | null;
}

interface ExploreCacheContextValue {
  /** Get cached results for a level key, or null if nothing cached. */
  get: (levelKey: string) => CacheEntry | null;
  /** Store results for a level key. */
  set: (levelKey: string, entry: CacheEntry) => void;
}

const ExploreCacheContext = createContext<ExploreCacheContextValue | null>(null);

export function useExploreCache(): ExploreCacheContextValue {
  const ctx = useContext(ExploreCacheContext);
  if (!ctx) throw new Error('useExploreCache must be used within <ExploreCacheProvider>');
  return ctx;
}

/**
 * Holds explore-page video results in memory so navigating to a video
 * and back restores the list instantly without re-fetching.
 *
 * Mounted in the [l1]/[l2] layout — survives all page navigations within
 * the same language pair.  Cache entries are keyed by `l2:level`.
 *
 * Uses a ref (not state) for the cache Map so `get` / `set` references
 * are stable — avoids re-triggering useEffect in useVideos.
 */
export function ExploreCacheProvider({ children }: { children: ReactNode }) {
  const cacheRef = useRef<Map<string, CacheEntry>>(new Map());

  const get = useCallback(
    (levelKey: string): CacheEntry | null => {
      return cacheRef.current.get(levelKey) ?? null;
    },
    [],
  );

  const set = useCallback(
    (levelKey: string, entry: CacheEntry) => {
      cacheRef.current.set(levelKey, entry);
    },
    [],
  );

  const value = React.useMemo<ExploreCacheContextValue>(
    () => ({ get, set }),
    [get, set],
  );

  return (
    <ExploreCacheContext.Provider value={value}>
      {children}
    </ExploreCacheContext.Provider>
  );
}
