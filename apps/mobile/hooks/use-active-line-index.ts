import { useMemo } from 'react';

/**
 * Find the index of the last subtitle line whose start time ≤ currentTime.
 *
 * Returns `defaultIndex` (default -1) when no line has started yet.
 *
 * Replaces the duplicated inline `useMemo` loops in SubtitleDisplay,
 * [videoId].tsx watch screen, and SubtitlesModeBand.
 *
 * @param startTimes  Array of start times (seconds), sorted ascending.
 * @param currentTime Current playback position (seconds).
 * @param defaultIndex Value returned when before the first subtitle.
 *                     SubtitlesModeBand uses 0 (always show first line in overlay).
 */
export function useActiveLineIndex(
  startTimes: number[],
  currentTime: number,
  defaultIndex = -1,
): number {
  return useMemo(() => {
    if (startTimes.length === 0) return defaultIndex;
    let idx = defaultIndex;
    for (let i = 0; i < startTimes.length; i++) {
      if (startTimes[i]! <= currentTime) idx = i;
      else break;
    }
    return idx;
  }, [startTimes, currentTime, defaultIndex]);
}
