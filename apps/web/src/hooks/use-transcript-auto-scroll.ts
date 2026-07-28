'use client';

import { useEffect, useRef } from 'react';
import {
  SCROLL,
  EDGE_MARGIN,
  CRITICAL_MARGIN,
  decideAutoScroll,
  type AutoScrollState,
} from '@langplayer/shared';

// ── Types ──────────────────────────────────────

interface UseTranscriptAutoScrollOptions {
  /** Index of the currently active subtitle line (0-based). -1 means none. */
  activeIndex: number;
  /** Ref to the list wrapper div containing [data-subtitle-index] elements. */
  listRef: React.RefObject<HTMLDivElement | null>;
  /** Ref to the scrollable container. Falls back to closest .overflow-y-auto ancestor. */
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>;
  /** Whether smoothScroll is enabled (from playback settings). */
  smoothScrollEnabled: boolean;
}

// ── Easing ─────────────────────────────────────

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

// ── Helpers ────────────────────────────────────

/**
 * Walk up from the subtitle list to find the element that is actually scrollable.
 *
 * We check computed `overflowY` (not just a class selector) so we detect
 * overflow regardless of how it's applied, and verify scrollability via
 * `scrollHeight > clientHeight` to avoid returning containers that have
 * overflow set but aren't overflowing (no scrollbar).
 *
 * Returns `null` when the page itself handles scrolling (no constrained-height
 * container found), in which case the hook falls back to `scrollIntoView()`.
 */
function findScrollContainer(
  listRef: React.RefObject<HTMLDivElement | null>,
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>,
): HTMLElement | null {
  const start = scrollContainerRef?.current ?? listRef.current;
  if (!start) return null;

  let el: HTMLElement | null = start;
  while (el) {
    const overflowY = getComputedStyle(el).overflowY;
    if (
      (overflowY === 'auto' || overflowY === 'scroll') &&
      el.scrollHeight > el.clientHeight
    ) {
      return el;
    }
    el = el.parentElement;
  }

  return null;
}

/**
 * Smooth-scroll `container.scrollTop` toward `target` using an ease-out-cubic animation.
 */
function animateScrollTop(
  container: HTMLElement,
  target: number,
  rafId: { current: number },
  animRef: { current: { startTime: number; startScroll: number; targetScroll: number } | null },
): void {
  const startScroll = container.scrollTop;
  animRef.current = {
    startTime: performance.now(),
    startScroll,
    targetScroll: target,
  };

  const animate = (timestamp: number) => {
    const state = animRef.current;
    if (!state) return;

    const elapsed = timestamp - state.startTime;
    const progress = Math.min(1, elapsed / SCROLL.ANIMATION_DURATION_MS);
    const eased = easeOutCubic(progress);
    container.scrollTop = state.startScroll + (state.targetScroll - state.startScroll) * eased;

    if (progress < 1) {
      rafId.current = requestAnimationFrame(animate);
    } else {
      animRef.current = null;
      rafId.current = 0;
    }
  };

  rafId.current = requestAnimationFrame(animate);
}

/**
 * Compute the target scrollTop that centers the element vertically
 * within the scroll container's visible area.
 */
function computeCenterTarget(
  el: HTMLElement,
  scrollContainer: HTMLElement,
  visibleH: number,
): number {
  const elRect = el.getBoundingClientRect();
  const scrollCtrRect = scrollContainer.getBoundingClientRect();
  const elTopRelative = elRect.top - scrollCtrRect.top + scrollContainer.scrollTop;
  return Math.max(0, elTopRelative - visibleH / 2 + elRect.height / 2);
}

// ── Hook ───────────────────────────────────────

export function useTranscriptAutoScroll({
  activeIndex,
  listRef,
  scrollContainerRef,
  smoothScrollEnabled,
}: UseTranscriptAutoScrollOptions) {
  // ── Refs ──
  const rafId = useRef(0);
  const lastAutoScrollTime = useRef(0);
  const lastScrolledIdx = useRef(-1);
  const isInitialLoad = useRef(true);
  const userScrolledUntil = useRef(0);
  const animRef = useRef<{
    startTime: number;
    startScroll: number;
    targetScroll: number;
  } | null>(null);

  // ── Reset state when video changes (activeIndex → -1) ──
  useEffect(() => {
    if (activeIndex === -1) {
      isInitialLoad.current = true;
      lastScrolledIdx.current = -1;
      lastAutoScrollTime.current = 0;
      if (rafId.current) {
        cancelAnimationFrame(rafId.current);
        rafId.current = 0;
      }
      animRef.current = null;
    }
  }, [activeIndex]);

  // ── Detect user manual scrolling (smoothScroll only) ──
  useEffect(() => {
    if (!smoothScrollEnabled) return;

    const scroller = findScrollContainer(listRef, scrollContainerRef);
    // Panel-scrolling: listen on the scrollable container.
    // Page-scrolling (no container found): listen on window.
    const target = scroller ?? window;

    const onUserScroll = () => {
      if (animRef.current) return; // scroll event from our own animation — ignore
      userScrolledUntil.current = Date.now() + SCROLL.USER_COOLDOWN_MS;
    };

    target.addEventListener('scroll', onUserScroll, { passive: true });
    return () => target.removeEventListener('scroll', onUserScroll);
  }, [smoothScrollEnabled, listRef, scrollContainerRef]);

  // ── Main scroll logic ──
  useEffect(() => {
    if (activeIndex < 0) return;

    const scrollContainer = findScrollContainer(listRef, scrollContainerRef);
    const usePageScroll = scrollContainer === null;

    const el = listRef.current?.querySelector(
      `[data-subtitle-index="${activeIndex}"]`,
    ) as HTMLElement | null;
    if (!el) return;

    // ═══════════════════════════════════════════════
    //  MEASUREMENT — compute visibility booleans
    // ═══════════════════════════════════════════════
    const elRect = el.getBoundingClientRect();
    const containerRect = usePageScroll
      ? { top: 0, bottom: window.innerHeight, height: window.innerHeight } as DOMRect
      : scrollContainer.getBoundingClientRect();
    const visibleH = containerRect.height;

    const topMargin = visibleH * EDGE_MARGIN;
    const criticalMargin = visibleH * CRITICAL_MARGIN;

    const nearTop = elRect.top < containerRect.top + topMargin;
    const nearBottom = elRect.bottom > containerRect.bottom - topMargin;
    const fullyOutTop = elRect.bottom < containerRect.top + criticalMargin;
    const fullyOutBottom = elRect.top > containerRect.bottom - criticalMargin;
    const isFullyOut = fullyOutTop || fullyOutBottom;
    const isNearEdge = nearTop || nearBottom;

    // ═══════════════════════════════════════════════
    //  DECISION — shared pure function
    // ═══════════════════════════════════════════════
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

    // ── Update refs ──
    lastAutoScrollTime.current = Date.now();
    lastScrolledIdx.current = activeIndex;
    isInitialLoad.current = false;

    // Cancel any in-flight animation
    if (rafId.current) {
      cancelAnimationFrame(rafId.current);
      rafId.current = 0;
    }

    // ═══════════════════════════════════════════════
    //  EXECUTION — platform-specific
    // ═══════════════════════════════════════════════

    // smoothScroll OFF → browser native smooth scroll
    if (!smoothScrollEnabled) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }

    // smoothScroll ON — page-scrolling fallback
    if (usePageScroll) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }

    // smoothScroll ON — panel-scrolling
    const targetScrollTop = computeCenterTarget(el, scrollContainer, visibleH);

    if (decision.animated) {
      animateScrollTop(scrollContainer, targetScrollTop, rafId, animRef);
    } else {
      // initial load → instant jump
      scrollContainer.scrollTo({ top: targetScrollTop, behavior: 'instant' as ScrollBehavior });
    }
  }, [activeIndex, smoothScrollEnabled, listRef, scrollContainerRef]);

  // ── Cleanup on unmount ──
  useEffect(() => {
    return () => {
      if (rafId.current) {
        cancelAnimationFrame(rafId.current);
        rafId.current = 0;
      }
    };
  }, []);
}
