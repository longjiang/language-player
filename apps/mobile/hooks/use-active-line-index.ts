import { useMemo } from 'react';
import { findActiveLineIndex } from '@langplayer/shared';

/**
 * Find the index of the last subtitle line whose start time ≤ currentTime.
 *
 * React hook wrapping the shared `findActiveLineIndex` pure function
 * with `useMemo` for render-cycle memoization.
 *
 * @param startTimes  Array of start times (seconds), sorted ascending.
 * @param currentTime Current playback position (seconds).
 * @param defaultIndex Value returned when before the first subtitle.
 */
export function useActiveLineIndex(
  startTimes: number[],
  currentTime: number,
  defaultIndex = -1,
): number {
  return useMemo(
    () => findActiveLineIndex(startTimes, currentTime, defaultIndex),
    [startTimes, currentTime, defaultIndex],
  );
}
