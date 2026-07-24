'use client';

import { useEffect, useRef } from 'react';

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

// ── Constants ──────────────────────────────────

/** Minimum interval (ms) between consecutive auto-scrolls when smoothScroll is on. */
const THROTTLE_MS = 2000;
/** Duration (ms) of the ease-out scroll animation. */
const ANIMATION_DURATION_MS = 3000;
/** Fraction of the visible area used as the "edge zone." Line in this zone triggers scrolling. */
const EDGE_MARGIN = 0.1;
/** Fraction of the visible area used as the "critical zone." Line this close to invisible bypasses throttle. */
const CRITICAL_MARGIN = 0.05;
/** After the user manually scrolls, auto-scroll is paused for this duration (ms). */
const USER_COOLDOWN_MS = 3000;

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
    const progress = Math.min(1, elapsed / ANIMATION_DURATION_MS);
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
  const isInitialLoad = useRef(true);
  const userScrolledUntil = useRef(0);
  const prevActiveIndex = useRef(activeIndex);
  const animRef = useRef<{
    startTime: number;
    startScroll: number;
    targetScroll: number;
  } | null>(null);

  // ── Reset state when video changes (activeIndex → -1) ──
  useEffect(() => {
    if (activeIndex === -1) {
      isInitialLoad.current = true;
      prevActiveIndex.current = -1;
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
      userScrolledUntil.current = Date.now() + USER_COOLDOWN_MS;
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
    //  VISIBILITY CHECK — uses the scroll container's visible area
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

    prevActiveIndex.current = activeIndex;

    if (!isNearEdge) return;

    // ═══════════════════════════════════════════════
    //  MODE: smoothScroll DISABLED
    // ═══════════════════════════════════════════════
    if (!smoothScrollEnabled) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }

    // ═══════════════════════════════════════════════
    //  MODE: smoothScroll ENABLED
    // ═══════════════════════════════════════════════

    const now = Date.now();

    // User cooldown (bypassed if line is fully out of view)
    if (!isFullyOut && now < userScrolledUntil.current) return;

    // Throttle (bypassed if line is fully out of view)
    if (!isFullyOut && now - lastAutoScrollTime.current < THROTTLE_MS) return;

    // Cancel any in-flight animation
    if (rafId.current) {
      cancelAnimationFrame(rafId.current);
      rafId.current = 0;
    }

    // Page-scrolling mode → fall back to scrollIntoView
    if (usePageScroll) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }

    // Panel-scrolling mode → custom RAF animation
    const scrollCtrRect = scrollContainer.getBoundingClientRect();
    const elTopRelative = elRect.top - scrollCtrRect.top + scrollContainer.scrollTop;
    const targetScrollTop = Math.max(
      0,
      elTopRelative - visibleH / 2 + elRect.height / 2,
    );

    // Initial load → instant jump
    if (isInitialLoad.current) {
      scrollContainer.scrollTo({ top: targetScrollTop, behavior: 'instant' as ScrollBehavior });
      isInitialLoad.current = false;
      lastAutoScrollTime.current = now;
      return;
    }

    lastAutoScrollTime.current = now;
    animateScrollTop(scrollContainer, targetScrollTop, rafId, animRef);
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
