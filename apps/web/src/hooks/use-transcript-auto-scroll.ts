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

const DEBUG = '[smoothScroll]';

/** Minimum interval (ms) between consecutive auto-scrolls when smoothScroll is on. */
const THROTTLE_MS = 2000;
/** Duration (ms) of the ease-out scroll animation. */
const ANIMATION_DURATION_MS = 800;
/**
 * Fraction of the viewport height used as the "edge zone."
 * When the active line enters this zone (top or bottom), scrolling is triggered.
 */
const EDGE_MARGIN = 0.25;
/**
 * Fraction of the viewport height used as the "critical zone."
 * When the line is this close to the edge of being fully invisible,
 * throttle is bypassed and the scroll happens immediately.
 */
const CRITICAL_MARGIN = 0.05;
/**
 * After the user manually scrolls, auto-scroll is paused for this duration (ms).
 */
const USER_COOLDOWN_MS = 3000;

// ── Easing ─────────────────────────────────────

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

// ── Helpers ────────────────────────────────────

/**
 * Walk up from the subtitle list to find the element that is ACTUALLY scrollable.
 *
 * On wide screens the TabbedPanel content div has a constrained height AND
 * `overflow-y: auto` — it's a true scroll container.
 *
 * On narrow screens there is NO constrained-height container — the page itself
 * scrolls. This function returns `null` in that case, and the hook falls back
 * to `scrollIntoView()` (which scrolls the nearest scrollable ancestor, i.e. the page).
 *
 * We check computed `overflowY` (not just a class selector) so we detect
 * overflow regardless of how it's applied. And we verify scrollability via
 * `scrollHeight > clientHeight` to avoid attaching listeners to elements that
 * have overflow set but aren't actually overflowing (no scrollbar).
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
      console.log(DEBUG, 'found scrollable container:', el.tagName, el.className.slice(0, 60));
      return el;
    }
    el = el.parentElement;
  }

  console.log(DEBUG, 'no scrollable container found — page itself handles scrolling');
  return null;
}

/**
 * Smooth-scroll `container.scrollTop` toward `target` using an ease-out-cubic animation.
 * Resolves the promise when the animation finishes or is cancelled.
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
      console.log(DEBUG, '✅ animation complete — final scrollTop =', container.scrollTop.toFixed(0));
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
  // ── Refs for smooth-scroll state ──
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
      console.log(DEBUG, 'activeIndex = -1 → resetting state');
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
    // On narrow screens (page-scrolling), listen on window.
    // On wide screens (panel-scrolling), listen on the scrollable container.
    const target = scroller ?? window;

    const onUserScroll = () => {
      if (animRef.current) {
        console.log(DEBUG, 'scroll event during animation — ignoring');
        return;
      }
      const until = Date.now() + USER_COOLDOWN_MS;
      userScrolledUntil.current = until;
      console.log(DEBUG, '👆 user scrolled — pausing auto-scroll until', new Date(until).toLocaleTimeString());
    };

    target.addEventListener('scroll', onUserScroll, { passive: true });
    return () => {
      target.removeEventListener('scroll', onUserScroll);
    };
  }, [smoothScrollEnabled, listRef, scrollContainerRef]);

  // ── Main scroll logic ──
  useEffect(() => {
    if (activeIndex < 0) return;

    const scrollContainer = findScrollContainer(listRef, scrollContainerRef);
    const usePageScroll = scrollContainer === null;

    const el = listRef.current?.querySelector(
      `[data-subtitle-index="${activeIndex}"]`,
    ) as HTMLElement | null;
    if (!el) {
      console.log(DEBUG, 'no DOM element for activeIndex =', activeIndex);
      return;
    }

    // ═══════════════════════════════════════════════
    //  VISIBILITY CHECK — always uses the viewport
    // ═══════════════════════════════════════════════
    const elRect = el.getBoundingClientRect();
    const viewportH = window.innerHeight;

    const topMargin = viewportH * EDGE_MARGIN;
    const criticalMargin = viewportH * CRITICAL_MARGIN;

    const nearTop = elRect.top < topMargin;
    const nearBottom = elRect.bottom > viewportH - topMargin;
    const fullyOutTop = elRect.bottom < criticalMargin;
    const fullyOutBottom = elRect.top > viewportH - criticalMargin;
    const isFullyOut = fullyOutTop || fullyOutBottom;
    const isNearEdge = nearTop || nearBottom;

    console.log(
      DEBUG,
      `activeIndex=${activeIndex} prev=${prevActiveIndex.current}`,
      `| el.top=${elRect.top.toFixed(0)} el.btm=${elRect.bottom.toFixed(0)}`,
      `| viewportH=${viewportH.toFixed(0)}`,
      `| nearTop=${nearTop} nearBottom=${nearBottom} fullyOut=${isFullyOut}`,
      `| scroll=${usePageScroll ? 'page' : 'panel'}`,
    );

    prevActiveIndex.current = activeIndex;

    // ── Line is comfortably visible → do nothing ──
    if (!isNearEdge) {
      console.log(DEBUG, '✅ line comfortably in viewport — no scroll needed');
      return;
    }

    // ═══════════════════════════════════════════════
    //  MODE: smoothScroll DISABLED (original behavior)
    // ═══════════════════════════════════════════════
    if (!smoothScrollEnabled) {
      console.log(DEBUG, 'smoothScroll OFF → scrollIntoView({ block: "center" })');
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }

    // ═══════════════════════════════════════════════
    //  MODE: smoothScroll ENABLED
    // ═══════════════════════════════════════════════

    const now = Date.now();

    // ── User cooldown (bypassed if line is fully out of view) ──
    if (!isFullyOut && now < userScrolledUntil.current) {
      const remaining = ((userScrolledUntil.current - now) / 1000).toFixed(1);
      console.log(DEBUG, `⏸️  user cooldown (${remaining}s remaining) — skipping`);
      return;
    }

    // ── Throttle (bypassed if line is fully out of view) ──
    if (!isFullyOut && now - lastAutoScrollTime.current < THROTTLE_MS) {
      const since = now - lastAutoScrollTime.current;
      console.log(DEBUG, `⏱️  throttle active (${since}ms since last scroll) — skipping`);
      return;
    }

    // ── Cancel any in-flight animation ──
    if (rafId.current) {
      console.log(DEBUG, 'cancelling previous animation');
      cancelAnimationFrame(rafId.current);
      rafId.current = 0;
    }

    // ── Page-scrolling mode (narrow screens) → fall back to scrollIntoView ──
    if (usePageScroll) {
      console.log(DEBUG, 'page-scrolling mode → scrollIntoView({ block: "center", behavior: "smooth" })');
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }

    // ── Panel-scrolling mode (wide screens) → custom RAF animation ──
    const elTopRelative = elRect.top - scrollContainer.getBoundingClientRect().top + scrollContainer.scrollTop;
    const targetScrollTop = Math.max(
      0,
      elTopRelative - viewportH / 2 + elRect.height / 2,
    );

    // Initial load → instant jump
    if (isInitialLoad.current) {
      console.log(DEBUG, `🚀 INITIAL LOAD — instant jump to ${targetScrollTop.toFixed(0)}`);
      scrollContainer.scrollTo({ top: targetScrollTop, behavior: 'instant' as ScrollBehavior });
      isInitialLoad.current = false;
      lastAutoScrollTime.current = now;
      return;
    }

    console.log(
      DEBUG,
      `🎬 starting animation: ${scrollContainer.scrollTop.toFixed(0)} → ${targetScrollTop.toFixed(0)}`,
      `(delta = ${(targetScrollTop - scrollContainer.scrollTop).toFixed(0)}, ${ANIMATION_DURATION_MS}ms)`,
    );

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
