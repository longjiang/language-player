'use client';

import { useState, useEffect } from 'react';
import type { DifficultyProfile } from '@langplayer/shared';
import { PYTHON_API_URL } from '@/lib/api-url';

/** Module-level cache — fetched once, shared across all components. */
let _cachedProfiles: DifficultyProfile | null = null;
/** In-flight promise — deduplicates concurrent fetches during initial mount. */
let _pendingPromise: Promise<DifficultyProfile | void> | null = null;

/**
 * Fetch difficulty profiles from the Python backend once.
 * Returns the profile dict, or null while loading.
 */
export function useDifficultyProfile(): DifficultyProfile | null {
  const [profiles, setProfiles] = useState<DifficultyProfile | null>(_cachedProfiles);

  useEffect(() => {
    if (_cachedProfiles) return;

    // If a fetch is already in-flight, await it instead of firing a duplicate.
    if (_pendingPromise) {
      _pendingPromise.then((data) => { if (data) setProfiles(data); });
      return;
    }

    _pendingPromise = fetch(`${PYTHON_API_URL}/difficulty-profiles`)
      .then((res) => res.json())
      .then((data: DifficultyProfile) => {
        _cachedProfiles = data;
        _pendingPromise = null;
        setProfiles(data);
        return data;
      })
      .catch(() => {
        _pendingPromise = null;
        // silently fail — getLevelFromDifficulty returns undefined without a
        // profile, so level badges are omitted (no hardcoded fallback level).
      });
  }, []);

  return profiles;
}
