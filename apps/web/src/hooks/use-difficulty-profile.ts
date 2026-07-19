'use client';

import { useState, useEffect } from 'react';
import type { DifficultyProfile } from '@langplayer/shared';
import { PYTHON_API_URL } from '@/lib/api-url';

/** Module-level cache — fetched once, shared across all components. */
let _cachedProfiles: DifficultyProfile | null = null;

/**
 * Fetch difficulty profiles from the Python backend once.
 * Returns the profile dict, or null while loading.
 */
export function useDifficultyProfile(): DifficultyProfile | null {
  const [profiles, setProfiles] = useState<DifficultyProfile | null>(_cachedProfiles);

  useEffect(() => {
    if (_cachedProfiles) return;
    fetch(`${PYTHON_API_URL}/difficulty-profiles`)
      .then((res) => res.json())
      .then((data: DifficultyProfile) => {
        _cachedProfiles = data;
        setProfiles(data);
      })
      .catch(() => {}); // silently fail — components fall back to hardcoded getLevel()
  }, []);

  return profiles;
}
