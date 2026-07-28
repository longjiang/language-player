/**
 * Shared transcript auto-scroll logic — platform-agnostic constants and
 * decision function consumed by both web (`useTranscriptAutoScroll`) and
 * mobile (`useTranscriptAutoScroll`) hooks.
 *
 * Each platform provides its own measurement (DOM getBoundingClientRect /
 * FlatList viewability) and execution (scrollTop / scrollToIndex) adapters.
 */

// ── Constants ──────────────────────────────────

export const SCROLL = {
  /** Minimum interval (ms) between consecutive auto-scrolls when smoothScroll is on. */
  THROTTLE_MS: 2000,
  /** After the user manually scrolls, auto-scroll is paused for this duration (ms). */
  USER_COOLDOWN_MS: 3000,
  /**
   * When the active line jumps by more than this many lines, treat it as a seek
   * and bypass throttle + user cooldown — the line is essentially invisible.
   */
  SEEK_INDEX_DELTA: 5,
  /** Duration (ms) of the ease-out scroll animation (web only; RN uses Animated.spring). */
  ANIMATION_DURATION_MS: 3000,
} as const;

/**
 * Fraction of viewport height used as the "edge zone."
 * Web: line within this fraction of top/bottom triggers scroll.
 * Mobile: not used (binary visibility model).
 */
export const EDGE_MARGIN = 0.1;

/**
 * Fraction of viewport height used as the "critical zone."
 * Web: line this close to invisible bypasses throttle + cooldown.
 * Mobile: approximated by !isVisible (fully out of view).
 */
export const CRITICAL_MARGIN = 0.05;

/**
 * Percent threshold for FlatList itemVisiblePercentThreshold (mobile only).
 */
export const VIEWABILITY_ITEM_THRESHOLD = 10;

// ── Types ──────────────────────────────────────

export interface AutoScrollState {
  /** Index of the currently active subtitle line (0-based). -1 means none. */
  activeIndex: number;
  /** The last index that was actually scrolled to. Used for seek detection. */
  prevScrolledIndex: number;
  /** Is the active line entirely outside the visible area? */
  isFullyOut: boolean;
  /** Is the active line at the top or bottom edge of the visible area? */
  isNearEdge: boolean;
  /** Timestamp (ms) of the last auto-scroll execution. */
  lastAutoScrollTime: number;
  /** Timestamp (ms) until which user-initiated scrolling suppresses auto-scroll. */
  userScrolledUntil: number;
  /** Whether smoothScroll is enabled (from playback settings). */
  smoothScrollEnabled: boolean;
  /** True only for the very first active line of a new video session. */
  isInitialLoad: boolean;
  /** Current timestamp (ms) — typically `Date.now()`. */
  now: number;
}

export interface AutoScrollDecision {
  /** Whether the platform should execute a scroll. */
  shouldScroll: boolean;
  /** false → instant jump (initial load or smoothScroll off); true → animated. */
  animated: boolean;
  /** Why the decision was made (for debugging / logging). */
  reason:
    | 'skip_not_edge'
    | 'skip_throttled'
    | 'skip_cooldown'
    | 'scroll';
}

// ── Decision function ──────────────────────────

/**
 * Pure function: given the current scroll state, decide whether to auto-scroll
 * and whether to animate.
 *
 * Rules (in order):
 * 1. If the line isn't near any edge and isn't fully out of view → skip.
 * 2. Seek detection: large index jumps bypass throttle and user cooldown.
 * 3. User cooldown: if the user recently scrolled manually, skip (unless seek).
 * 4. Throttle: skip if we scrolled too recently (unless seek or fully-out).
 * 5. Otherwise → scroll. Animate unless initial load or smoothScroll is off.
 */
export function decideAutoScroll(s: AutoScrollState): AutoScrollDecision {
  // Rule 1: not near any edge → nothing to do
  if (!s.isNearEdge && !s.isFullyOut) {
    return { shouldScroll: false, animated: false, reason: 'skip_not_edge' };
  }

  const idxDelta = Math.abs(s.activeIndex - s.prevScrolledIndex);
  const isSeek = idxDelta > SCROLL.SEEK_INDEX_DELTA;

  // Rule 2+3: user cooldown (bypassed on seek or fully-out)
  if (!s.isFullyOut && !isSeek && s.now < s.userScrolledUntil) {
    return { shouldScroll: false, animated: false, reason: 'skip_cooldown' };
  }

  // Rule 4: throttle (bypassed on seek or fully-out — matches web's critical path)
  if (!s.isFullyOut && !isSeek && s.now - s.lastAutoScrollTime < SCROLL.THROTTLE_MS) {
    return { shouldScroll: false, animated: false, reason: 'skip_throttled' };
  }

  // Rule 5: scroll
  const animated = !s.isInitialLoad && s.smoothScrollEnabled;

  return { shouldScroll: true, animated, reason: 'scroll' };
}

// ── Active line index ─────────────────────────

/**
 * Find the index of the last subtitle line whose start time ≤ currentTime.
 *
 * Pure function — platform-agnostic. Used by both web and mobile to
 * determine which subtitle line is currently active during playback.
 *
 * @param startTimes  Array of start times (seconds), sorted ascending.
 * @param currentTime Current playback position (seconds).
 * @param defaultIndex Value returned when before the first subtitle.
 *                     Use 0 for overlay mode (always show first line),
 *                     -1 for transcript mode (no active line yet).
 */
export function findActiveLineIndex(
  startTimes: number[],
  currentTime: number,
  defaultIndex = -1,
): number {
  if (startTimes.length === 0) return defaultIndex;
  let idx = defaultIndex;
  for (let i = 0; i < startTimes.length; i++) {
    if (startTimes[i]! <= currentTime) idx = i;
    else break;
  }
  return idx;
}
