import { useRef, useEffect, useCallback, useState } from 'react';
import type { FlatList, NativeSyntheticEvent, NativeScrollEvent, LayoutChangeEvent } from 'react-native';
import { decideAutoScroll, SCROLL, type AutoScrollState } from '@langplayer/shared';

// ── Types ──────────────────────────────────────

export interface UseTranscriptAutoScrollOptions {
  /** Index of the currently active subtitle line (0-based). -1 means none. */
  activeIndex: number;
  /** Ref to the FlatList rendering subtitle lines. */
  flatListRef: React.RefObject<FlatList<any> | null>;
  /** Whether smoothScroll is enabled (from playback settings). */
  smoothScrollEnabled: boolean;
  /** Estimated height of each subtitle item in pixels. Use ~100 with translations, ~56 without. Default 48. */
  estimatedItemHeight?: number;
}

export interface UseTranscriptAutoScrollReturn {
  /** Pass to FlatList's `onScroll` prop. */
  onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  /** Pass to FlatList's `onLayout` prop. */
  onLayout: (e: LayoutChangeEvent) => void;
  /** Pass to FlatList's `onScrollBeginDrag` prop to detect user manual scrolling. */
  onScrollBeginDrag: () => void;
}

// ── Hook ───────────────────────────────────────

/**
 * Auto-scroll a FlatList to keep the active subtitle line visible.
 *
 * Visibility is computed from scroll position and container height
 * (NOT from `onViewableItemsChanged`, which is unreliable during mount).
 */
export function useTranscriptAutoScroll({
  activeIndex,
  flatListRef,
  smoothScrollEnabled,
  estimatedItemHeight = 48,
}: UseTranscriptAutoScrollOptions): UseTranscriptAutoScrollReturn {
  // ── Refs ──
  const lastAutoScrollTime = useRef(0);
  const lastScrolledIdx = useRef(-1);
  const isInitialLoad = useRef(true);
  const userScrolledUntil = useRef(0);

  // ── Scroll-position-based visibility ──
  const scrollYRef = useRef(0);
  const [containerHeight, setContainerHeight] = useState(0);
  // Epoch bumps whenever scrollY changes enough to change firstVisible,
  // causing the scroll effect to re-evaluate visibility.
  const [lastFirstVisible, setLastFirstVisible] = useState(-1);

  const computeFirstVisible = useCallback(() => {
    if (containerHeight <= 0) return -1;
    return Math.floor(scrollYRef.current / estimatedItemHeight);
  }, [containerHeight, estimatedItemHeight]);

  const computeVisibleCount = useCallback(() => {
    if (containerHeight <= 0) return 0;
    return Math.max(1, Math.floor(containerHeight / estimatedItemHeight));
  }, [containerHeight, estimatedItemHeight]);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollYRef.current = e.nativeEvent.contentOffset.y;
      // Don't bump epoch during user cooldown — prevents auto-scroll
      // from fighting the user's manual scroll.
      if (Date.now() < userScrolledUntil.current) return;
      const newFirst = computeFirstVisible();
      // Only bump epoch when firstVisible actually changes (debounce)
      if (newFirst !== -1 && newFirst !== lastFirstVisible) {
        setLastFirstVisible(newFirst);
      }
    },
    [computeFirstVisible, lastFirstVisible],
  );

  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const h = e.nativeEvent.layout.height;
      if (h > 0 && h !== containerHeight) {
        console.log(`[auto-scroll] 📏 container height: ${h}px (≈${Math.floor(h / estimatedItemHeight)} items)`);
        setContainerHeight(h);
      }
    },
    [containerHeight],
  );

  // ── Detect user manual scrolling ──
  const onScrollBeginDrag = useCallback(() => {
    userScrolledUntil.current = Date.now() + SCROLL.USER_COOLDOWN_MS;
  }, []);

  // ── Reset state on video change (activeIndex → -1) ──
  useEffect(() => {
    if (activeIndex === -1) {
      console.log('[auto-scroll] 🔄 reset: video changed');
      isInitialLoad.current = true;
      lastScrolledIdx.current = -1;
      lastAutoScrollTime.current = 0;
      scrollYRef.current = 0;
    }
  }, [activeIndex]);

  // ── Main scroll logic ──
  useEffect(() => {
    if (activeIndex < 0) return;
    if (containerHeight <= 0) return;

    const firstVisible = computeFirstVisible();
    const visibleCount = computeVisibleCount();
    const lastVisible = firstVisible >= 0 ? firstVisible + visibleCount - 1 : -1;

    const isVisible = firstVisible >= 0 && activeIndex >= firstVisible && activeIndex <= lastVisible;
    const isFullyOut = !isVisible;
    const isNearEdge = isVisible && (activeIndex === firstVisible || activeIndex === lastVisible);

    // If user recently scrolled, don't treat "fully out" as an emergency —
    // the user deliberately scrolled away from the active line. Respect cooldown.
    const now = Date.now();
    const inUserCooldown = now < userScrolledUntil.current;
    const effectiveFullyOut = inUserCooldown ? false : isFullyOut;

    const state: AutoScrollState = {
      activeIndex,
      prevScrolledIndex: lastScrolledIdx.current,
      isFullyOut: effectiveFullyOut,
      isNearEdge,
      lastAutoScrollTime: lastAutoScrollTime.current,
      userScrolledUntil: userScrolledUntil.current,
      smoothScrollEnabled,
      isInitialLoad: isInitialLoad.current,
      now,
    };

    const decision = decideAutoScroll(state);

    console.log(`[auto-scroll] 🧠 decision: activeIdx=${activeIndex} range=[${firstVisible},${lastVisible}] (scrollY=${scrollYRef.current}px h=${containerHeight}px itemH=${estimatedItemHeight}) isFullyOut=${isFullyOut} effOut=${effectiveFullyOut} isNearEdge=${isNearEdge} userCooldown=${inUserCooldown} isInit=${isInitialLoad.current} prevScrolled=${lastScrolledIdx.current} shouldScroll=${decision.shouldScroll} reason=${decision.reason} animated=${decision.animated}`);

    if (!decision.shouldScroll) return;

    // Execute
    lastAutoScrollTime.current = Date.now();
    lastScrolledIdx.current = activeIndex;
    isInitialLoad.current = false;

    console.log(`[auto-scroll] 🚀 EXECUTE scrollToIndex: index=${activeIndex} animated=${decision.animated} reason=${decision.reason}`);

    flatListRef.current?.scrollToIndex({
      index: activeIndex,
      animated: decision.animated,
      viewPosition: 0.5,
    });
  }, [activeIndex, containerHeight, lastFirstVisible, smoothScrollEnabled, flatListRef, computeFirstVisible, computeVisibleCount]);

  return { onScroll, onLayout, onScrollBeginDrag };
}
