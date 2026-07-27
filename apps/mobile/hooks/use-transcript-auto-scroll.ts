import { useRef, useEffect, useCallback, useMemo } from 'react';
import type { FlatList } from 'react-native';
import { decideAutoScroll, SCROLL, type AutoScrollState } from '@langplayer/shared';

// ── Types ──────────────────────────────────────

export interface UseTranscriptAutoScrollOptions {
  /** Index of the currently active subtitle line (0-based). -1 means none. */
  activeIndex: number;
  /** Ref to the FlatList rendering subtitle lines. */
  flatListRef: React.RefObject<FlatList<any> | null>;
  /** Whether smoothScroll is enabled (from playback settings). */
  smoothScrollEnabled: boolean;
}

export interface UseTranscriptAutoScrollReturn {
  /** Pass to FlatList's `onViewableItemsChanged` prop. */
  onViewableItemsChanged: (info: { viewableItems: Array<{ index: number | null }> }) => void;
  /** Pass to FlatList's `viewabilityConfig` prop. */
  viewabilityConfig: { itemVisiblePercentThreshold: number };
  /** Pass to FlatList's `onScrollBeginDrag` prop to detect user manual scrolling. */
  onScrollBeginDrag: () => void;
}

// ── Hook ───────────────────────────────────────

/**
 * Auto-scroll a FlatList to keep the active subtitle line visible.
 *
 * Port of the web `useTranscriptAutoScroll` hook — same decision logic
 * via `@langplayer/shared`, adapted for React Native's FlatList API.
 *
 * Features:
 * - Visibility-gated: only scrolls when the active line is near the edge
 *   or fully out of view (via `onViewableItemsChanged`).
 * - Seek bypass: large index jumps bypass throttle and user cooldown.
 * - User cooldown: manual scrolling suppresses auto-scroll for 3s.
 * - Throttle: max one auto-scroll every 2s (bypassed on seek / fully-out).
 * - Initial load: first active line jumps instantly (no animation).
 * - Respects `playback.smoothScroll` setting for animation.
 */
export function useTranscriptAutoScroll({
  activeIndex,
  flatListRef,
  smoothScrollEnabled,
}: UseTranscriptAutoScrollOptions): UseTranscriptAutoScrollReturn {
  // ── Refs ──
  const lastAutoScrollTime = useRef(0);
  const lastScrolledIdx = useRef(-1);
  const isInitialLoad = useRef(true);
  const userScrolledUntil = useRef(0);
  // visibleRange is mutated by onViewableItemsChanged (callback, not render)
  const visibleRange = useRef({ first: -1, last: -1 });

  // ── Track visible items (RN equivalent of DOM getBoundingClientRect) ──
  const onViewableItemsChanged = useCallback(
    (info: { viewableItems: Array<{ index: number | null }> }) => {
      const items = info.viewableItems;
      if (items.length > 0) {
        visibleRange.current = {
          first: items[0]!.index ?? -1,
          last: items[items.length - 1]!.index ?? -1,
        };
      }
    },
    [],
  );

  const viewabilityConfig = useMemo(
    () => ({ itemVisiblePercentThreshold: 10 }),
    [],
  );

  // ── Detect user manual scrolling ──
  const onScrollBeginDrag = useCallback(() => {
    userScrolledUntil.current = Date.now() + SCROLL.USER_COOLDOWN_MS;
  }, []);

  // ── Reset state on video change (activeIndex → -1) ──
  useEffect(() => {
    if (activeIndex === -1) {
      isInitialLoad.current = true;
      lastScrolledIdx.current = -1;
      lastAutoScrollTime.current = 0;
      visibleRange.current = { first: -1, last: -1 };
    }
  }, [activeIndex]);

  // ── Main scroll logic ──
  useEffect(() => {
    if (activeIndex < 0) return;

    const { first, last } = visibleRange.current;
    const isVisible = activeIndex >= first && activeIndex <= last;
    const isFullyOut = !isVisible;
    const isNearEdge = isVisible && (activeIndex === first || activeIndex === last);

    const state: AutoScrollState = {
      activeIndex,
      prevScrolledIndex: lastScrolledIdx.current,
      isFullyOut,
      isNearEdge,
      lastAutoScrollTime: lastAutoScrollTime.current,
      userScrolledUntil: userScrolledUntil.current,
      smoothScrollEnabled,
      isInitialLoad: isInitialLoad.current,
      now: Date.now(),
    };

    const decision = decideAutoScroll(state);

    if (!decision.shouldScroll) return;

    // Execute
    lastAutoScrollTime.current = Date.now();
    lastScrolledIdx.current = activeIndex;
    isInitialLoad.current = false;

    flatListRef.current?.scrollToIndex({
      index: activeIndex,
      animated: decision.animated,
      viewPosition: 0.5,
    });
  }, [activeIndex, smoothScrollEnabled, flatListRef]);

  return { onViewableItemsChanged, viewabilityConfig, onScrollBeginDrag };
}
