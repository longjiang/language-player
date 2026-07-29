# ISSUE-001: Mobile Subtitle Auto-Scroll — Visibility Detection Failure

## Metadata
- **Issue ID**: ISSUE-001
- **Date**: 2026-07-28
- **Status**: open — root cause confirmed, partial fix applied, remaining issues documented below
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

## Root Cause (Confirmed)

**The hardcoded item height estimate of 48px is ~2× too small** when translations are visible. Both the scroll-position-based visibility math and FlatList's `getItemLayout` use this value, causing the system to believe 9 items fit in the viewport when only ~4 actually do.

### Why 48px?

The estimate was correct when `SubtitleDisplay` was first built: each rendered `Pressable` contained only a `TokenizedText` line (no translation). With `py-2` (16px vertical padding) + `mb-1` (4px margin) + one line of text (~24-28px), 48px was accurate. When the L1 translation `<Text>` was added below the tokenized line, item height roughly doubled, but the estimate was never updated. Two copies of `48` exist:

- `apps/mobile/hooks/use-transcript-auto-scroll.ts` line 5: `const ESTIMATED_ITEM_HEIGHT = 48;`
- `apps/mobile/components/video/SubtitleDisplay.tsx` line ~232: `getItemLayout` returns `length: 48, offset: 48 * index`

### How the Wrong Estimate Causes the Deadlock

1. **Visibility math is wrong**: `visibleCount = 443 / 48 ≈ 9`, but reality is `443 / 100 ≈ 4`. The auto-scroll hook computes range `[0, 8]` at the top of the list, so lines 4–8 all appear "safe" (neither `isNearEdge` nor `isFullyOut`).

2. **`decideAutoScroll()` skips everything**: Rule 1 says if the line is not near an edge and not fully out of view, skip. Lines 1–8 all match this — the hook thinks they're visible.

3. **Only line 9 triggers**: At `activeIndex=9`, `isNearEdge=true` (equal to `last=8`), so the scroll finally fires. But visually, line 4 was already off-screen.

4. **After the first scroll, everything works**: The scroll event provides a real `scrollY` offset, and the post-scroll `onViewableItemsChanged` reports the correct `[3,12]` range. This confirms the logic is sound — only the estimate is wrong.

### Why `onViewableItemsChanged` Looked Like the Culprit

The original implementation used `onViewableItemsChanged` (not scroll-position math), and it reported `range=[0,9]` on mount — all 10 rendered items appeared "viewable." This was investigated as a FlatList timing/race issue, but it's a red herring: with the correct 100px estimate, FlatList would work fine (or at least close enough). The `[0,9]` report is a symptom of FlatList trusting `getItemLayout`'s 48px offset for initial overlap calculations before a real scroll event provides ground-truth measurements.

### Why a FlatList with Correct Estimates Would Work by Default

If items truly matched the 48px estimate, `443 / 48 ≈ 9` would be correct — 9 items would actually fit. The system would auto-scroll correctly out of the box. The bug only manifests because the estimate diverges from reality by ~2×.

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
| 3 | Compute visibility from scroll position (`scrollY / 48`) instead of `onViewableItemsChanged` | Range computed as `[0,8]` — correct approach, wrong constant. Fix: use 100px (not 48px) when translations are shown |
| 4 | Add comprehensive debug logging throughout the chain | Confirmed the exact point of failure and sequence of events |

## Possible Causes (Post-Investigation)

### ✅ Confirmed Root Cause: Item Height Mismatch

The hardcoded `ESTIMATED_ITEM_HEIGHT = 48` in the auto-scroll hook and `length: 48` in `getItemLayout` are both ~2× too small when translations are visible. Real items are ~96–110px (tokenized text line + L1 translation text + padding/margin). The visibility formula `containerHeight / 48` produces `visibleCount ≈ 9` instead of the real `≈ 4`. Every computed range based on this estimate is wrong.

### ❌ Not a Cause: FlatList Viewability Callback Bugs

The original diagnosis suspected `onViewableItemsChanged` was unreliable on mount (reporting `[0,9]` when only 4 items actually fit). This was a **symptom**, not a cause. FlatList's native viewability tracker uses real frame measurements for overlap detection — it's correct. The `[0,9]` report likely comes from a timing window where newly-created views (from `maxToRenderPerBatch`) briefly have zero/unknown frames before Yoga layout positions them. But even if FlatList reported the correct `[0,3]`, the scroll-position-based approach (attempt #3) would have worked — it didn't only because of the 48px estimate. **Fixing FlatList viewability is unnecessary; fixing the estimate fixes everything.**

### ❌ Not a Cause: No Re-Trigger After `scrollToIndex`

With the correct estimate, `scrollToIndex` fires at line 3 (not line 9), and the subsequent scroll event naturally triggers a correct `onViewableItemsChanged` update. No manual re-trigger mechanism is needed.

### ❌ Not a Cause: User Scroll Not Refreshing Visibility

Same as above — with the correct estimate, the system never gets stuck in the first place, so user scroll handling is irrelevant to this bug.

## Proposed Fix

All approaches below center on the same goal: **make the item height used in visibility calculations match reality.**

### Solution A (Recommended — Quick Fix): Better Hardcoded Estimate Based on Translation State

`SubtitleDisplay` already knows whether translations are visible via `showTranslation`. Use this to pick a realistic estimate and pass it to both the auto-scroll hook and `getItemLayout`.

**Changes to `use-transcript-auto-scroll.ts`:**
- Add `estimatedItemHeight?: number` to `UseTranscriptAutoScrollOptions` (default `48`)
- Replace the hardcoded `ESTIMATED_ITEM_HEIGHT` constant with the option value in `computeFirstVisible` and `computeVisibleCount`

**Changes to `SubtitleDisplay.tsx`:**
- Compute `const estimatedItemHeight = showTranslation ? 100 : 56;`
- Pass `estimatedItemHeight` to `useTranscriptAutoScroll()`
- Use `estimatedItemHeight` in `getItemLayout` (`length` and `offset`)

**Why this works:** With translations on, `443 / 100 ≈ 4` → range `[0, 3]` → line 3 triggers scroll at the bottom edge. With translations off, `443 / 56 ≈ 7` → range `[0, 6]` → line 6 triggers scroll. The estimate doesn't need to be perfect (±20px error only shifts the trigger by 1 line).

**Effort:** ~5 lines changed. **Risk:** Very low — `onScrollToIndexFailed` already handles imprecision from `getItemLayout`.

### Solution B (Robust Follow-Up): Dynamic Measurement via `onLayout`

For cases where the hardcoded estimate is wrong (large accessibility font sizes, tablets, very long lines wrapping to 3+ lines), measure actual item height.

**Changes to `SubtitleDisplay.tsx`:**
- Add `onLayout` to the `Pressable` in `renderItem` to capture real height
- Track the maximum observed height in state: `const [measuredItemHeight, setMeasuredItemHeight] = useState(estimatedItemHeight)`
- Use `measuredItemHeight` for both the hook and `getItemLayout`

**Why this is better:** Adapts to any font size, language, or screen width automatically. The first render cycle uses the hardcoded estimate (from Solution A) before `onLayout` fires — so Solution A is the prerequisite fallback.

**Effort:** ~20 lines. **Risk:** Low — `onLayout` fires within the same frame as render, so the stale estimate affects at most 1–2 decision cycles.

### Solution C (Safety Net): Force Scroll When ActiveIndex Runs Away

Regardless of which fix is chosen, add a belt-and-suspenders check: if `activeIndex` has advanced far beyond the computed `visibleCount` and no scroll has happened, force one anyway. This prevents the "stuck at top" failure mode from ever happening silently, even if a future change introduces a new height mismatch.

```ts
// In the scroll effect, before calling decideAutoScroll:
const effectiveFullyOut = isFullyOut || (
  isInitialLoad.current &&
  activeIndex > computeVisibleCount() * 2
);
```

**Effort:** ~3 lines. **Risk:** None — only fires in the degenerate case the other fixes prevent.

### Recommended Implementation Order

| Step | Solution | Fixes the bug? | Handles edge cases? |
|---|---|---|---|
| 1 | Solution A — Better estimate based on `showTranslation` | ✅ Yes | ⚠️ Mostly (large fonts may still be off) |
| 2 | Solution B — Dynamic measurement via `onLayout` | ✅ Yes | ✅ Yes |
| 3 | Solution C — Safety net for runaway activeIndex | — | 🛡️ Prevents silent failure in any future regression |

## Implementation Notes (2026-07-28)

### What Was Implemented

**Commit `b5b35cac`** applied Solutions A + B together:

1. **Removed `ESTIMATED_ITEM_HEIGHT = 48`** from the hook; it now accepts `estimatedItemHeight` as an option parameter (default 48).
2. **Dynamic measurement via `onLayout`**: each `Pressable` in `SubtitleDisplay` reports its real rendered height. The maximum observed height is used for both `getItemLayout` and the auto-scroll hook. Falls back to `showTranslation ? 100 : 56` until the first measurement arrives.
3. **User cooldown protection**: two changes to prevent auto-scroll from fighting manual scrolling:
   - `onScroll` does not update `lastFirstVisible` (the effect trigger) while the user is in cooldown
   - `isFullyOut` is suppressed to `false` during cooldown before passing to `decideAutoScroll`, preventing the "fully out = emergency" bypass from overriding user intent
4. **Debug display**: each subtitle line shows `#i · y≈Xpx` in `__DEV__` mode. The hook's debug log now includes `itemH`, `effOut`, and `userCooldown` fields.

### What Works ✅

- Auto-scroll now fires at the **correct line**. With translations visible, the active line triggers a scroll around index 3–4 (when it reaches the bottom of the visible 4-line viewport), rather than waiting until index 9.
- The item height measurement via `onLayout` works correctly — `measuredItemHeight` converges to the actual rendered height within the first few frames.
- Visibility math is now accurate: `containerHeight / actualItemHeight ≈ actual visible count`.

### What Does NOT Work ❌

**Problem 1: Aggressive / runaway scrolling.** After the initial scroll fires correctly, the list begins scrolling too frequently. After several scrolls, the active line ends up **above the viewport** (negative y-offset relative to the visible area). This suggests the `lastFirstVisible` epoch mechanism is causing repeated re-evaluations that drive the scroll position past the correct target.

**Hypothesis**: `scrollToIndex` with `viewPosition: 0.5` centers the active line, but `computeFirstVisible()` (using `scrollY / itemHeight`) may compute a `firstVisible` that still shows the line at the edge, triggering another scroll. Combined with `isFullyOut` bypassing throttle when the line appears to be "out of view" (due to the math discrepancy between `getItemLayout` positions and real positions), this creates a feedback loop.

**Problem 2: Snap-back on user scroll still occurs.** Despite the cooldown protection, there are scenarios where user scroll is overridden. This may happen when `activeIndex` advances (video playing) during user scroll — the effect triggered by the `activeIndex` dependency uses `scrollYRef.current` (which reflects the user's manual scroll position), finds `isFullyOut=true`, and `effectiveFullyOut` is correctly suppressed. But if the effect also fires due to `lastFirstVisible` changing from a prior auto-scroll event, the timing may still cause a snap-back.

**Problem 3: `getItemLayout` / real position mismatch.** Items have variable heights (different line lengths, some with wrapped text). `getItemLayout` uses a uniform `measuredItemHeight` (the maximum observed height), so computed offsets don't match real cumulative positions. This causes `scrollToIndex` to land at slightly wrong positions (mitigated by `onScrollToIndexFailed`, but the error accumulates across multiple scrolls).

### What To Try Next

1. **Investigate the `lastFirstVisible` feedback loop**: add logging to track how many times the scroll effect fires per activeIndex advance, and whether `lastFirstVisible` changes are causing redundant re-evaluations.
2. **Consider ditching `lastFirstVisible` as an effect dependency**: the scroll effect should only fire on `activeIndex` changes. Scroll-position-based visibility should be read from refs (not state) inside the effect, so scroll events don't trigger re-evaluation.
3. **Try `viewPosition: 0` (top-align)** instead of `0.5` (center). Top-aligning means the active line is always at the top edge, which gives more predictable `isNearEdge` behavior.
4. **Consider using `scrollToOffset` with a computed target** instead of `scrollToIndex`, to avoid the `getItemLayout` vs real-position mismatch.
5. **Revisit whether `onViewableItemsChanged` could work now** that item heights are correct. With accurate `getItemLayout`, FlatList's native viewability tracker should report correct ranges — the original mount-time race condition may no longer be an issue.

## Resolution (2026-07-28): Replaced `SubtitleDisplay` with `SimpleSubsForDebug`

After multiple attempts to fix the auto-scroll behavior in `SubtitleDisplay` (see attempts 1–5 above, plus the `lastFirstVisible` feedback loop investigation), we concluded that patching the existing component was not the right path. The problems ran deeper than a single mis-estimate:

- **Feedback loops** between `scrollToIndex`, `onScroll`, and effect re-fires were difficult to isolate and reproduce consistently.
- **`getItemLayout` uniform-height mismatch** with variable-height lines caused cumulative positioning errors across multiple scrolls.
- **Shared `useTranscriptAutoScroll` hook** added indirection that made debugging harder — every change to the hook risked subtly affecting the web implementation.

### What we did

We built **`SimpleSubsForDebug`** as a fresh component with its own inline auto-scroll logic — no shared hook, no `getItemLayout`, no `onViewableItemsChanged`. Instead it uses:

- **`Animated.Value` + `Animated.timing`** (3-second ease-out) for smooth scroll, driven frame-by-frame via `scrollToOffset` — avoiding `scrollToIndex`/`getItemLayout` entirely.
- **Scroll-position-based visibility** computed inline from `scrollY / estimatedItemHeight` — simple, direct, debuggable.
- **User-cooldown detection** via `onScrollBeginDrag` + `scrollAnim.stopAnimation()` — no fighting with FlatList callbacks.
- **Dual-mode**: `singleLine` (centered active line, replaces `SubtitlesModeBand`) and full transcript FlatList (replaces `SubtitleDisplay`).

### What was removed

- **`SubtitlesModeBand.tsx`** — deleted; single-line subtitle mode is now `SimpleSubsForDebug singleLine`.
- **`SubtitleDisplay.tsx`** — deleted; full transcript mode is now `SimpleSubsForDebug` (default).
- The **shared `useTranscriptAutoScroll` hook** is no longer used by mobile. Web continues to use its own `useTranscriptAutoScroll` hook in `apps/web/src/hooks/`.

### Code sharing impact

The shared `decideAutoScroll()` function in `packages/shared/src/transcript-scroll.ts` is also no longer consumed by mobile. The web hook uses it, the mobile component does not. This is not ideal for long-term maintainability:

- **Platform differences** (DOM `getBoundingClientRect` vs FlatList `scrollToIndex`/`scrollToOffset`, RAF vs `Animated.timing`, `overflow-y: auto` vs native scroll gestures) mean the decision logic *should* be shared, but the measurement and execution layers are inherently platform-specific.
- **Debugging difficulty**: when mobile and web shared a hook, a fix for one platform could silently break the other. Keeping them separate for now reduces regression risk.
- **Future work**: once the mobile implementation stabilizes in production, we should extract the platform-agnostic parts (decision rules, throttle/cooldown constants) back into `@langplayer/shared` and refactor both hooks to consume a common core, while keeping measurement and execution platform-specific.

### Status

| Component | Status |
|---|---|
| `SubtitlesModeBand.tsx` | Deleted |
| `SubtitleDisplay.tsx` | Deleted |
| `SimpleSubsForDebug.tsx` | Active — dual-mode: `singleLine` + transcript FlatList with inline auto-scroll |
| `useTranscriptAutoScroll` (mobile) | Orphaned — still exists but no longer imported by any component |
| `useTranscriptAutoScroll` (web) | Unchanged — continues to use `decideAutoScroll()` from shared |
| `decideAutoScroll()` (shared) | Unchanged — still consumed by web; mobile duplicated the decision logic inline |

## Related Files

- `apps/mobile/components/video/SimpleSubsForDebug.tsx` — current subtitle component (replaces both `SubtitleDisplay` and `SubtitlesModeBand`)
- `apps/mobile/hooks/use-transcript-auto-scroll.ts` — orphaned mobile hook (no longer imported)
- `apps/web/src/hooks/use-transcript-auto-scroll.ts` — web auto-scroll hook (unchanged)
- `packages/shared/src/transcript-scroll.ts` — shared `decideAutoScroll()` + `SCROLL` constants (still used by web, duplicated inline in mobile)
- `docs/specs/026-unified-transcript-autoscroll.md` — architecture spec
