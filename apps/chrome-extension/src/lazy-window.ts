/**
 * Shared lazy-loading window for the transcript.
 *
 * Tokenization, dictionary batch lookup, and translation all process only the
 * subtitle lines near the playhead — a rolling window of ±WINDOW_LOOKAHEAD_LINES
 * around the active cue — instead of the whole (often 500+ line) transcript.
 * This mirrors apps/web + apps/mobile (SPEC-021: chunks of 5, ±3 chunks in
 * each direction = ±15 lines) so the extension uses one source of truth for
 * "which lines do I work on right now" instead of three separate ad-hoc
 * lookahead constants.
 */

import { useCallback, useMemo } from 'react';

/** Lines per translation/batch chunk. */
export const WINDOW_CHUNK_SIZE = 5;
/** Chunks ahead of and behind the active cue to process. */
export const WINDOW_LOOKAHEAD_CHUNKS = 3;
/** Lines within the window on each side of the active cue. */
export const WINDOW_LOOKAHEAD_LINES = WINDOW_LOOKAHEAD_CHUNKS * WINDOW_CHUNK_SIZE;

export interface CueWindow {
  /** Inclusive first line index to process. */
  start: number;
  /** Inclusive last line index to process. */
  end: number;
}

/** Lines within the rolling window around the active cue. */
export function computeCueWindow(activeCueIdx: number, totalCues: number): CueWindow {
  if (totalCues <= 0) return { start: 0, end: -1 };
  // Before playback starts (activeCueIdx === -1) anchor on the first line.
  const center = activeCueIdx < 0 ? 0 : activeCueIdx;
  return {
    start: Math.max(0, center - WINDOW_LOOKAHEAD_LINES),
    end: Math.min(totalCues - 1, center + WINDOW_LOOKAHEAD_LINES),
  };
}

/** Whether `idx` falls inside the rolling window around the active cue. */
export function isInCueWindow(idx: number, activeCueIdx: number, totalCues: number): boolean {
  const w = computeCueWindow(activeCueIdx, totalCues);
  return idx >= w.start && idx <= w.end;
}

/**
 * Ordered chunk indices covering the window, priority first — the chunk
 * containing the active cue, then expanding outward (ahead before behind,
 * matching how a forward-watching user needs the next lines sooner).
 * Returns an empty array when there are no cues.
 */
export function orderedWindowChunks(activeCueIdx: number, totalCues: number): number[] {
  const totalChunks = totalCues <= 0 ? 0 : Math.ceil(totalCues / WINDOW_CHUNK_SIZE);
  if (totalChunks === 0) return [];
  const prio = activeCueIdx < 0 ? 0 : Math.floor(activeCueIdx / WINDOW_CHUNK_SIZE);
  const out: number[] = [];
  const seen = new Set<number>();
  const add = (c: number): void => {
    if (c >= 0 && c < totalChunks && !seen.has(c)) {
      seen.add(c);
      out.push(c);
    }
  };
  add(prio);
  for (let r = 1; r <= WINDOW_LOOKAHEAD_CHUNKS; r += 1) {
    add(prio + r);
    add(prio - r);
  }
  return out;
}

/**
 * React hook exposing the current rolling window. Kept in lazy-window.ts so
 * tokenization, batch lookup, and translation all subscribe to the same
 * window rather than each recomputing their own lookahead.
 */
export function useLazyCueWindow(
  activeCueIdx: number,
  totalCues: number,
): { window: CueWindow; isInWindow: (idx: number) => boolean } {
  const window = useMemo(() => computeCueWindow(activeCueIdx, totalCues), [activeCueIdx, totalCues]);
  const isInWindow = useCallback((idx: number) => idx >= window.start && idx <= window.end, [window]);
  return { window, isInWindow };
}
