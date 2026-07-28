# ISSUE-001: Mobile Subtitle Auto-Scroll — Visibility Detection Failure

## Metadata
- **Issue ID**: ISSUE-001
- **Date**: 2026-07-28
- **Status**: open
- **Platform**: Mobile (React Native / Expo, FlatList-based)
- **Components affected**:
  - `apps/mobile/hooks/use-transcript-auto-scroll.ts`
  - `apps/mobile/hooks/use-active-line-index.ts`
  - `apps/mobile/components/video/SubtitleDisplay.tsx`
  - `packages/shared/src/transcript-scroll.ts` (decision logic, unaffected by this bug)
- **Spec**: [SPEC-026: Unified Transcript Auto-Scroll](../specs/026-unified-transcript-autoscroll.md)

---

## Symptom

On a narrow phone screen in transcript mode, only 4 subtitle lines are visible (indices 0–3), but auto-scroll does not trigger until the active line reaches index 9 (line 10). Expected behavior: auto-scroll should trigger around index 3–4 when the active line reaches the bottom edge of the visible area.

## Root Cause (Working Hypothesis)

**FlatList's `onViewableItemsChanged` reports an incorrect initial visible range**, and the auto-scroll hook trusts this value without correcting for the actual viewport capacity.

### Detailed Chain of Events

1. **Initial mount**: FlatList renders items with `initialNumToRender={5}`. `onViewableItemsChanged` fires once with `range=[0,4]` (correct — 5 items rendered, 4 fit on screen).

2. **Second batch**: `maxToRenderPerBatch={5}` renders 5 more items. `onViewableItemsChanged` fires again with `range=[0,9]` (incorrect — FlatList's virtualizer now considers all 10 rendered items as "viewable").

3. **Range frozen**: Because auto-scroll only scrolls to index 0 (already at the top) and the user doesn't manually scroll, `onViewableItemsChanged` does NOT fire again. The incorrect range `[0,9]` persists indefinitely.

4. **All lines look "safe"**: With `range=[0,9]`, lines 1–8 are all `isNearEdge=false` and `isFullyOut=false`. The shared `decideAutoScroll()` returns `reason=skip_not_edge` for every one of them.

5. **Only line 9 triggers scroll**: When `activeIndex=9`, it becomes `isNearEdge=true` (equal to `last=9`), so auto-scroll finally fires.

### Why the Scroll-Position-Based Fix Didn't Help

In a subsequent attempt, `onViewableItemsChanged` was replaced with scroll-position-based visibility computation (`scrollY / 48 = firstVisible`, `containerHeight / 48 = visibleCount`). This also produced the wrong range because:

- Container height was measured at **443px**
- Estimated item height is **48px** (from `getItemLayout`)
- Computed visible count: `443 / 48 ≈ 9` items
- With scroll at top (`scrollY=0`): range = `[0, 8]`
- This is almost as wrong as FlatList's `[0, 9]`

**The problem**: Actual rendered item height is significantly larger than 48px. Each `Pressable` contains:
- A `TokenizedText` component (line itself)
- Optionally a `Text` element with L1 translation below it

With translations visible, line height is approximately **96–110px**, meaning only **4 items** actually fit in 443px. The formula `containerHeight / 48` overestimates by ~2× when translations are shown.

### Verified Behavior (Post-Fix)

After the first `scrollToIndex(9)` call, the FlatList DOES correctly update:
```
📊 viewability changed: items=10 range=[3,12]
📊 viewability changed: items=9  range=[4,12]
📊 viewability changed: items=6  range=[7,12]
```

This confirms: FlatList's `onViewableItemsChanged` works correctly **after a scroll event**. The bug is purely about the initial mount state.

## Evidence (Logs)

### First run (onViewableItemsChanged-based visibility)

```
🔄 reset: video changed
📊 viewability changed: items=5 range=[0,4] indices=[0,1,2,3,4]          ← correct initial
📊 viewability changed: items=10 range=[0,9] indices=[0,1,...,9]         ← overwritten, WRONG
🧠 activeIdx=0 range=[0,9] isNearEdge=true → 🚀 scrollToIndex:0 animated=false  ← correct (initial load)
🧠 activeIdx=1 range=[0,9] isNearEdge=false → skip_not_edge              ← WRONG (should be at edge after ~3)
🧠 activeIdx=2 range=[0,9] isNearEdge=false → skip_not_edge
🧠 activeIdx=3 range=[0,9] isNearEdge=false → skip_not_edge              ← visually at bottom, but "safe"
🧠 activeIdx=4 range=[0,9] isNearEdge=false → skip_not_edge
🧠 activeIdx=5 range=[0,9] isNearEdge=false → skip_not_edge
🧠 activeIdx=6 range=[0,9] isNearEdge=false → skip_not_edge
🧠 activeIdx=7 range=[0,9] isNearEdge=false → skip_not_edge
🧠 activeIdx=8 range=[0,9] isNearEdge=false → skip_not_edge
🧠 activeIdx=9 range=[0,9] isNearEdge=true → 🚀 scrollToIndex:9 animated=true   ← finally!
```

### After scrollToIndex(9) — viewability updates correctly:

```
📊 viewability changed: items=10 range=[3,12]    ← FlatList finally reports correct range
📊 viewability changed: items=9  range=[4,12]    ← further refined
🧠 activeIdx=9  range=[4,12] isNearEdge=false → skip_not_edge   ← correct (centered, not at edge)
🧠 activeIdx=10 range=[4,12] isNearEdge=false → skip_not_edge
🧠 activeIdx=11 range=[4,12] isNearEdge=false → skip_not_edge
🧠 activeIdx=12 range=[4,12] isNearEdge=true → 🚀 scrollToIndex:12  ← correct trigger
```

### Second run (scroll-position-based visibility)

```
📏 container height: 443.33px (≈9 items)          ← overestimated! items are taller than 48px
🧠 activeIdx=0 range=[0,8] scrollY=0 → isNearEdge=true → 🚀 scrollToIndex:0
🧠 activeIdx=2 range=[0,8] scrollY=0 → skip_not_edge   ← still wrong, range too large
... (same pattern as above)
```

## Things We've Tried

| # | Approach | Result |
|---|---|---|
| 1 | Convert `visibleRange` from `useRef` to `useState` | Did not help — the state value was still `[0,9]` because FlatList's callback reported that |
| 2 | Reduce `initialNumToRender`: 10→5, `windowSize`: 5→3, `maxToRenderPerBatch`: 10→5 | Some improvement: initial range became `[0,4]` instead of `[0,9]`, but second batch still overwrites to `[0,9]` |
| 3 | Compute visibility from scroll position (`scrollY / 48`) instead of `onViewableItemsChanged` | Range computed as `[0,8]` — still wrong because item height is ~96px not 48px |
| 4 | Add comprehensive debug logging throughout the chain | Confirmed the exact point of failure and sequence of events |

## Possible Causes (Ranked by Likelihood)

### 1. Item Height Mismatch (Most Likely)

The `getItemLayout` declares `length: 48`, but actual items are taller when translations are visible (~96–110px). This causes:
- FlatList's internal position calculations to be off by ~2×
- Scroll-position-based visibility overestimates visible count by ~2×
- `scrollToIndex` may land at the wrong position (mitigated by `onScrollToIndexFailed`)

**Fix**: Use a larger estimate (96–110px) or dynamically measure item height. Also pass the actual item height to the auto-scroll hook so it can compute accurate visibility.

### 2. FlatList Viewability Callback Unreliable on Initial Mount

`onViewableItemsChanged` reports rendered items as "viewable" before the viewport measurement stabilizes. The first report (`[0,4]`) is already gone by the time the second report (`[0,9]`) locks in.

**Fix**: Ignore `onViewableItemsChanged` on mount. Wait for a scroll event or a layout event before trusting visibility data. Alternatively, use a short `setTimeout` after mount to read the final range.

### 3. No Mechanism to Re-Trigger Visibility After `scrollToIndex` Completes

After the initial `scrollToIndex(0)`, the list is at the top. The FlatList doesn't fire `onViewableItemsChanged` because "nothing changed" from its perspective (items 0–9 are still "rendered and visible"). A re-trigger after scroll completion would force a corrected range.

**Fix**: Schedule a visibility refresh after each `scrollToIndex` call (e.g., via `InteractionManager.runAfterInteractions`).

### 4. User Scroll Not Triggering Visibility Refresh

Even if the user manually scrolls, `onScrollBeginDrag` only sets cooldown — it doesn't force a visibility re-computation.

**Fix**: Also handle `onScrollEndDrag` / `onMomentumScrollEnd` to refresh the visible range after user interaction.

## Proposed Fix (Summary)

The most promising approach is a combination:

1. **Fix item height estimate**: Use actual item height (96–110px with translations) instead of 48px for visibility calculations
2. **Defer initial visibility**: Don't trust visibility data until after the first scroll event or a `setTimeout(500)` settles
3. **Force refresh after each `scrollToIndex`**: Use `InteractionManager.runAfterInteractions` or a timeout to re-compute visibility after scroll animations complete
4. **Hybrid measurement**: Combine `onScroll` (for scroll position) + `onLayout` (for container height) + actual measured item height (from `onLayout` of first item) for accurate visible count

## Related Files

- `apps/mobile/hooks/use-transcript-auto-scroll.ts` — auto-scroll logic
- `apps/mobile/hooks/use-active-line-index.ts` — active line detection
- `apps/mobile/components/video/SubtitleDisplay.tsx` — FlatList, item rendering, `getItemLayout`
- `packages/shared/src/transcript-scroll.ts` — shared `decideAutoScroll()` function
- `docs/specs/026-unified-transcript-autoscroll.md` — architecture spec
