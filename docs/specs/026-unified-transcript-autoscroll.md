# SPEC-026: Unified Transcript Auto-Scroll

## Metadata
- **Spec ID**: SPEC-026
- **Feature**: Unified transcript auto-scroll logic across web and mobile
- **Status**: draft
- **Created**: 2026-07-28
- **See also**:
  - `packages/shared/src/transcript-scroll.ts` — shared decision function (only mobile uses it today)
  - `apps/web/src/hooks/use-transcript-auto-scroll.ts` — web hook (~230 lines, all inline)
  - `apps/mobile/hooks/use-transcript-auto-scroll.ts` — mobile hook (~130 lines, delegates to shared)
  - `apps/web/src/components/video/subtitle-display.tsx` — web SubtitleDisplay
  - `apps/mobile/components/video/SubtitleDisplay.tsx` — mobile SubtitleDisplay
  - `apps/mobile/hooks/use-active-line-index.ts` — extracted active-line-index hook (mobile only)
  - [SPEC-010](./010-video-watch-page-layout-and-ui.md) — watch page layout (transcript mode)

---

## Overview

Both web and mobile have a `useTranscriptAutoScroll` hook that keeps the active subtitle line visible as the video plays. They share the same goals — center the active line, throttle to 2s, respect user scrolling for 3s — but the implementations diverged:

- **Mobile** delegates decision logic to `@langplayer/shared` (`decideAutoScroll()`) and has seek detection (jumps >5 lines bypass throttle).
- **Web** has all logic inline with duplicated constants, no seek detection, and its own two-tier edge-detection system (10% mild / 5% urgent margins).

This spec defines a unified architecture where both platforms share the same decision logic, constants, and types from `@langplayer/shared`, while keeping platform-specific measurement and execution in each hook.

---

## Current State

### Architecture (current)

```
┌─────────────────────────────────────────────────┐
│              @langplayer/shared                  │
│  transcript-scroll.ts                            │
│  ┌─────────────┐  ┌───────────────────────────┐ │
│  │ SCROLL      │  │ decideAutoScroll()        │ │
│  │ constants   │  │ (pure function)           │ │
│  └─────────────┘  └───────────────────────────┘ │
│    used by mobile    used by mobile ONLY ❌       │
└─────────────────────────────────────────────────┘
         │                          │
         ▼                          ▼
┌─────────────────────┐  ┌─────────────────────────┐
│  WEB HOOK (230 loc) │  │  MOBILE HOOK (130 loc)  │
│                     │  │                         │
│  Constants:         │  │  Uses SCROLL constants  │
│   THROTTLE_MS ✖     │  │  from shared ✅         │
│   USER_COOLDOWN_MS ✖│  │                         │
│   EDGE_MARGIN ✖     │  │  Calls decideAutoScroll │
│   CRITICAL_MARGIN ✖ │  │  from shared ✅         │
│                     │  │                         │
│  Decision logic:    │  │  Measurement:           │
│   inline ✖          │  │   onViewableItemsChanged│
│                     │  │   (index-based)         │
│  No seek detection ✖│  │                         │
│                     │  │  Execution:             │
│  Measurement:       │  │   scrollToIndex(0.5)    │
│   getBoundingClient │  │   (native animation)    │
│   Rect (pixel-based)│  │                         │
│                     │  │                         │
│  Execution:         │  │                         │
│   scrollIntoView or │  │                         │
│   RAF scrollTop     │  │                         │
└─────────────────────┘  └─────────────────────────┘
```

**Problems:**

1. **Web duplicates constants** (`THROTTLE_MS`, `USER_COOLDOWN_MS`, `ANIMATION_DURATION_MS`) that already exist in `SCROLL`.
2. **Web duplicates decision logic** — the same 5-rule algorithm exists in both places, diverging over time. Web already missed seek detection.
3. **Web has no seek detection** — clicking a transcript timestamp or scrubbing the video doesn't bypass throttle/cooldown, causing a noticeable delay before the transcript scrolls to the new position.
4. **`ANIMATION_DURATION_MS` is defined in shared but only used by web** — the shared constant exists but web doesn't import it.
5. **Mobile has a separate `useActiveLineIndex` hook** that web duplicates inline in `SubtitleDisplay`.

---

## Proposed Architecture

### Design Principle

**Share the decision. Each platform owns its measurement and execution.**

```
┌──────────────────────────────────────────────────────┐
│                 @langplayer/shared                     │
│  transcript-scroll.ts                                  │
│  ┌──────────────────┐  ┌────────────────────────────┐ │
│  │ SCROLL constants  │  │ decideAutoScroll(state)    │ │
│  │ (single source)   │  │ → { shouldScroll,         │ │
│  │                   │  │     animated, reason }     │ │
│  │ + EDGE_MARGIN     │  │                            │ │
│  │ + CRITICAL_MARGIN │  │ Pure function.             │ │
│  └──────────────────┘  │ Both platforms call it. ✅  │ │
│                        └────────────────────────────┘ │
│  Shared types:                                         │
│   AutoScrollState, AutoScrollDecision                  │
└──────────────────────────────────────────────────────┘
              │                          │
              ▼                          ▼
┌──────────────────────────┐  ┌──────────────────────────┐
│  WEB HOOK (thin adapter) │  │  MOBILE HOOK (thin)      │
│                          │  │                          │
│  Measurement:            │  │  Measurement:            │
│   getBoundingClientRect  │  │   onViewableItemsChanged │
│   → isFullyOut, isNearEdge│  │   → isFullyOut, isNearEdge│
│                          │  │                          │
│  Calls decideAutoScroll  │  │  Calls decideAutoScroll  │
│                          │  │                          │
│  Execution:              │  │  Execution:              │
│   scrollIntoView (off)   │  │   scrollToIndex(0.5)     │
│   RAF scrollTop (on)     │  │   (native animation)     │
│   Page-scroll fallback   │  │                          │
└──────────────────────────┘  └──────────────────────────┘
```

### What Gets Shared (`@langplayer/shared`)

**Already shared:**
- `SCROLL` constants (`THROTTLE_MS`, `USER_COOLDOWN_MS`, `SEEK_INDEX_DELTA`, `ANIMATION_DURATION_MS`)
- `AutoScrollState` interface
- `AutoScrollDecision` interface
- `decideAutoScroll()` pure function (5 rules)

**To add:**
- `EDGE_MARGIN = 0.1` — fraction of viewport height considered the "edge zone" for triggering scroll
- `CRITICAL_MARGIN = 0.05` — fraction of viewport height for the "critical zone" that bypasses throttle/cooldown
- `VIEWABILITY_ITEM_THRESHOLD = 10` — percent threshold for FlatList `itemVisiblePercentThreshold` (mobile)

These constants are defined in shared even though only one platform uses each, because they serve as the canonical documentation of the auto-scroll behavior and prevent accidental divergence.

### What Stays Platform-Specific (and Why)

| Concern | Web | Mobile | Why Can't Share |
|---|---|---|---|
| **Measurement** | `getBoundingClientRect()` — pixel-precise element positions relative to viewport | `onViewableItemsChanged` — index-based, "which items are visible?" | DOM APIs vs React Native FlatList virtualized list — fundamentally different measurement models |
| **Edge detection** | Two-tier: 10% mild edge, 5% critical edge (continuous positioning) | Binary: item is visible or not (discrete, per-item) | Web can measure partial visibility of a single line; mobile only knows whether ≥10% of an item is on screen |
| **Scroll execution** | `container.scrollTop = value` or `el.scrollIntoView()` | `flatListRef.scrollToIndex({ index, viewPosition })` | DOM imperative scroll vs RN declarative FlatList API |
| **Animation** | Custom RAF loop with `easeOutCubic` (3s, JS thread) | RN native `scrollToIndex({ animated: true })` (native driver) | Web has no native scroll animation API; RN has no `requestAnimationFrame` for scroll |
| **Container discovery** | DOM walk-up for `overflow-y: auto/scroll` ancestor | N/A — FlatList IS the container | DOM tree traversal has no RN equivalent |
| **Page-scroll fallback** | Falls back to `scrollIntoView` when no scrollable container found | N/A — FlatList always scrolls | Web-only concern (narrow screens where transcript fills the page) |
| **User scroll detection** | `scroll` event listener on container or `window` | `onScrollBeginDrag` callback on FlatList | Different event models |

---

## Decision Rules (Reference)

The shared `decideAutoScroll()` implements these rules in order:

| # | Rule | Effect |
|---|---|---|
| 1 | Line is fully in the safe zone (not near edge, not out of view) | **Skip** — no scroll needed |
| 2 | Seek detected: active line jumped >5 indices from last scrolled position | **Bypass** throttle + cooldown |
| 3 | User recently scrolled manually (<3s ago) | **Skip** — respect user intent (unless seek or fully-out) |
| 4 | Auto-scrolled too recently (<2s ago) | **Skip** — throttle (unless seek or fully-out) |
| 5 | Otherwise | **Scroll** — animated if smoothScroll is on AND not initial load |

### How Each Platform Feeds the Decision

| State Field | Web | Mobile |
|---|---|---|
| `isFullyOut` | `elRect.bottom < containerRect.top + visibleH * CRITICAL_MARGIN` OR `elRect.top > containerRect.bottom - visibleH * CRITICAL_MARGIN` | `activeIndex < firstVisibleIndex` OR `activeIndex > lastVisibleIndex` |
| `isNearEdge` | `elRect.top < containerRect.top + visibleH * EDGE_MARGIN` OR `elRect.bottom > containerRect.bottom - visibleH * EDGE_MARGIN` | `activeIndex === firstVisibleIndex` OR `activeIndex === lastVisibleIndex` |
| `prevScrolledIndex` | `lastScrolledIdx.current` (NEW — added in Phase 2) | `lastScrolledIdx.current` (already tracked) |

### How Each Platform Executes the Decision

| Decision | Web | Mobile |
|---|---|---|
| `shouldScroll: false` | No-op | No-op |
| `animated: false` | `scrollTo({ behavior: 'instant' })` or `scrollIntoView({ behavior: 'instant' })` | `scrollToIndex({ animated: false, viewPosition: 0.5 })` |
| `animated: true` | RAF `animateScrollTop()` with 3s ease-out-cubic | `scrollToIndex({ animated: true, viewPosition: 0.5 })` |

---

## Implementation Plan

### Phase 1: Enhance Shared Module

**File:** `packages/shared/src/transcript-scroll.ts`

1. Add edge margin constants to the existing `SCROLL` object or as standalone exports:

```ts
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
```

2. No changes to `decideAutoScroll()` — it already handles both platforms' needs.

3. Update exports in `packages/shared/src/index.ts` if needed (already exports `transcript-scroll`).

### Phase 2: Refactor Web Hook

**File:** `apps/web/src/hooks/use-transcript-auto-scroll.ts`

1. **Replace duplicated constants** with imports from shared:

   ```ts
   // BEFORE (remove):
   const THROTTLE_MS = 2000;
   const USER_COOLDOWN_MS = 3000;
   const EDGE_MARGIN = 0.1;
   const CRITICAL_MARGIN = 0.05;

   // AFTER (add):
   import { SCROLL, EDGE_MARGIN, CRITICAL_MARGIN, decideAutoScroll, type AutoScrollState } from '@langplayer/shared';
   ```

2. **Add `prevScrolledIndex` ref** for seek detection:

   ```ts
   const lastScrolledIdx = useRef(-1); // NEW
   ```

   Update it after each scroll execution alongside `lastAutoScrollTime`.

3. **Replace inline decision logic** with `decideAutoScroll()`:

   ```ts
   // BEFORE (~50 lines of inline if/else in the main useEffect):
   if (!isNearEdge) return;
   if (!smoothScrollEnabled) { el.scrollIntoView(...); return; }
   if (!isFullyOut && now < userScrolledUntil.current) return;
   if (!isFullyOut && now - lastAutoScrollTime.current < THROTTLE_MS) return;
   // ... RAF animation path

   // AFTER:
   const state: AutoScrollState = {
     activeIndex,
     prevScrolledIndex: lastScrolledIdx.current,
     isFullyOut,    // already computed from DOM (unchanged)
     isNearEdge,    // already computed from DOM (unchanged)
     lastAutoScrollTime: lastAutoScrollTime.current,
     userScrolledUntil: userScrolledUntil.current,
     smoothScrollEnabled,
     isInitialLoad: isInitialLoad.current,
     now: Date.now(),
   };

   const decision = decideAutoScroll(state);
   if (!decision.shouldScroll) return;

   lastAutoScrollTime.current = Date.now();
   lastScrolledIdx.current = activeIndex;
   isInitialLoad.current = false;

   // Execution (platform-specific — unchanged logic, using decision.animated):
   if (usePageScroll || !smoothScrollEnabled) {
     el.scrollIntoView({ block: 'center', behavior: decision.animated ? 'smooth' : 'instant' });
   } else {
     const target = computeCenterTarget(el, scrollContainer, visibleH);
     if (decision.animated) {
       animateScrollTop(scrollContainer, target, rafId, animRef);
     } else {
       scrollContainer.scrollTo({ top: target, behavior: 'instant' as ScrollBehavior });
     }
   }
   ```

4. **Extract `computeCenterTarget`** for clarity (currently inline math):

   ```ts
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
   ```

5. **Keep unchanged:**
   - `findScrollContainer()` — DOM traversal
   - `animateScrollTop()` / `easeOutCubic()` — RAF animation
   - Page-scrolling fallback logic
   - User scroll detection via `scroll` event listener

6. **Reset `lastScrolledIdx` on video change** (alongside existing reset of other refs when `activeIndex === -1`).

### Phase 3: Mobile Hook (Minor Cleanup)

**File:** `apps/mobile/hooks/use-transcript-auto-scroll.ts`

Already uses shared `decideAutoScroll()` and `SCROLL`. Changes are minimal:

1. **Use shared constant** for viewability threshold:

   ```ts
   // BEFORE:
   const viewabilityConfig = useMemo(() => ({ itemVisiblePercentThreshold: 10 }), []);

   // AFTER:
   import { VIEWABILITY_ITEM_THRESHOLD } from '@langplayer/shared';
   const viewabilityConfig = useMemo(
     () => ({ itemVisiblePercentThreshold: VIEWABILITY_ITEM_THRESHOLD }),
     [],
   );
   ```

2. No other changes — the hook is already the reference implementation.

### Phase 4: Extract Shared `findActiveLineIndex` (Optional)

**Current state:** Mobile has `apps/mobile/hooks/use-active-line-index.ts`. Web has the same algorithm inline in `SubtitleDisplay.tsx`:

```ts
// Both do the same thing:
let idx = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].starttime <= currentTime) idx = i;
  else break;
}
```

**Option:** Could move this to `@langplayer/shared` as a pure function:

```ts
// packages/shared/src/subtitle-utils.ts
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
```

This is low-priority since the algorithm is trivial (5 lines), but it eliminates the last duplicated algorithm between the two subtitle displays.

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Shared `decideAutoScroll()` changes break one platform | Both hooks' behavior is covered by the same decision rules. Any change to the shared function must be tested on both platforms. The `reason` field in `AutoScrollDecision` enables debugging. |
| Web's two-tier edge detection maps imperfectly to mobile's binary model | The shared function only consumes booleans (`isFullyOut`, `isNearEdge`), not the raw measurements. Each platform is free to compute these booleans however makes sense for its measurement model. |
| Seek detection changes behavior web users are used to | Seek detection is an improvement — it makes the transcript respond faster to user-initiated jumps. The existing behavior (delayed scroll on seek) is a bug, not a feature. |
| `ANIMATION_DURATION_MS` in shared is web-only | Documented as such. Having it in shared prevents it from drifting between the web hook's inline constant and the shared module. If mobile ever needs custom animation duration, it's already available. |

---

## Success Criteria

1. **Web hook imports `SCROLL`, `EDGE_MARGIN`, `CRITICAL_MARGIN`, `decideAutoScroll` from `@langplayer/shared`** — no duplicated constants or decision logic.
2. **Web hook gains seek detection** — jumping >5 lines via timestamp click or scrubbing scrolls the transcript immediately.
3. **Mobile hook uses shared `VIEWABILITY_ITEM_THRESHOLD`** instead of hardcoded `10`.
4. **Both hooks produce identical scroll decisions** for the same logical state (same `isFullyOut`, `isNearEdge`, timing, etc.).
5. **No regressions** — existing scroll behavior (centering, throttle, cooldown, initial load instant jump) is preserved on both platforms.
6. **TypeScript compiles** with `npx turbo typecheck` on both platforms.
