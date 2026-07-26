# ADR-0016: Mobile Animations — LayoutAnimation + Animated API over react-native-reanimated

**Date**: 2026-07-26
**Status**: accepted
**Supersedes**: ADR-0014 (animation section for mobile)
**Branches**: `reanimated-a`, `reanimated-b`, `reanimated-c` (experiments), `layout-animation-dialog` (implementation)

## Context

ADR-0014 specified `react-native-reanimated` for all mobile animations — dialog enter/exit, sheet slide-up, drawer transitions — using spring physics and the `entering`/`exiting` props API. The plan was to import `FadeIn`, `FadeOut`, `SlideInDown`, and `SlideOutDown` presets from reanimated.

Four attempts across three branches all failed: any import of `react-native-reanimated` in application code causes an immediate crash at the splash screen in Expo Go. The crash is at the native module layer, not in JavaScript, and occurs before any app code executes.

### Investigation Summary

| Branch | Strategy | Native modules | Result |
|---|---|---|---|
| `reanimated-a` | `npx expo install react-native-reanimated` as direct dep | 4.5.0 local + 4.5.3 root (dual) | Crash |
| `reanimated-a` | Add `react-native-worklets` as direct dep too | 4 native module copies | Crash |
| `reanimated-b` | npm `overrides` to 4.5.0/0.10.2, fresh install | Single copies, matching Expo Go | Crash |
| `reanimated-c` | No dep changes; import from transitive reanimated | Existing transitive 4.5.0 | Crash |

What was ruled out:
- **Version mismatch** — aligning all versions to single copies via npm overrides didn't fix it
- **Native module duplication** — eliminating local copies didn't fix it
- **Missing babel plugin** — installing `react-native-worklets` caused plugin version conflicts; omitting it broke compilation
- **Direct vs transitive dependency** — importing from transitive reanimated (without promoting to direct dep) also crashes

The working state: `react-native-reanimated@4.5.0` exists as a transitive dependency used internally by `nativewind → react-native-css-interop` and `expo-router → react-native-drawer-layout`. No application code imports it. When application code imports reanimated, the native module initialization path differs, and Expo Go cannot handle it.

The root cause is specific to **Expo Go's pre-built native module layer**. A development build (`npx expo run:ios`) would likely work, but Expo Go's fast refresh workflow is essential for this project's development velocity.

## Decision

**Use React Native's built-in `LayoutAnimation` API as the primary animation approach for all mobile UI transitions. Use React Native's `Animated` API for cases requiring per-property control (opacity, scale, translation) where `LayoutAnimation` is insufficient.**

Both APIs are built into React Native, require zero additional dependencies, and work reliably in Expo Go.

### API Selection Guide

| Animation need | Recommended API | Why |
|---|---|---|
| Dialog open/close (fade) | `LayoutAnimation` | Simplest: one call before state change |
| Drawer open/close (slide + fade) | `LayoutAnimation` | Same pattern as dialogs |
| Bottom sheet slide-up/down | `LayoutAnimation` | Layout-level animation is sufficient |
| Tab panel transitions | `LayoutAnimation` | Content swap animations |
| Per-property animations (opacity + translateY) | `Animated` API | Independent property control |
| Continuous animations (progress bars, spinners) | `Animated` API | Looping, interpolation |
| Gesture-driven animations (swipe to dismiss) | `Animated` API | Tight gesture integration |

The `LayoutAnimation` API animates the entire layout change with a single call — ideal for show/hide transitions. The `Animated` API provides per-property control via `Animated.Value` for cases where different properties need different timing or interpolation. Both use `useNativeDriver: true` for 60fps performance.

### Implementation

**File: `apps/mobile/lib/animations.ts`** — single source of truth for all animation presets and utilities:

```tsx
import { useState, useCallback } from 'react';
import { LayoutAnimation, Platform, UIManager } from 'react-native';

// Enable LayoutAnimation on Android (disabled by default)
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/** Shared animation preset: 200ms fade with ease-in-out. */
const fadeAnimation = LayoutAnimation.create(
  200,
  LayoutAnimation.Types.easeInEaseOut,
  LayoutAnimation.Properties.opacity,
);

/**
 * Drop-in replacement for `useState(false)` for boolean show/hide state.
 * Calls `LayoutAnimation.configureNext()` before every state change.
 *
 * @example
 * const [open, setOpen] = useAnimatedBoolean();
 * // setOpen(true) fades in, setOpen(false) fades out
 */
export function useAnimatedBoolean(initial = false) {
  const [value, setValue] = useState(initial);
  const animatedSetValue = useCallback((next: boolean) => {
    LayoutAnimation.configureNext(fadeAnimation);
    setValue(next);
  }, []);
  return [value, animatedSetValue] as const;
}

/**
 * Call before any state change that triggers a layout transition.
 * For cases where `useAnimatedBoolean()` doesn't fit (e.g., string | null state).
 *
 * @example
 * configureLayoutAnimation();
 * setSelectedWord(word); // opens with animation
 * configureLayoutAnimation();
 * setSelectedWord(null); // closes with animation
 */
export function configureLayoutAnimation() {
  LayoutAnimation.configureNext(fadeAnimation);
}
```

**Consumer usage — two patterns:**

```tsx
// Pattern 1: Boolean state — drop-in replacement for useState(false)
const [open, setOpen] = useAnimatedBoolean();

// Pattern 2: Non-boolean state — call helper before setter
configureLayoutAnimation();
setSelectedWord(word);
```

### Trade-offs vs react-native-reanimated

| Concern | react-native-reanimated | LayoutAnimation + Animated |
|---|---|---|
| Install complexity | Dependency hell in monorepo + Expo Go | Built-in, zero deps |
| Expo Go compatibility | ❌ Crashes | ✅ Works |
| Animation quality | Spring physics, 60fps | Easing curves, 60fps (native driver) |
| Enter/exit API | Declarative `entering`/`exiting` props | Imperative: call before state change |
| Separate enter/exit config | Yes (different presets) | No for LayoutAnimation; yes for Animated API |
| Per-property control | Yes (opacity, translate, scale, rotation) | Yes via Animated API (Animated.Value) |
| Gesture integration | Native gesture handler + worklets | Animated.event + PanResponder |
| Learning curve | Steep (worklets, shared values) | Low (standard React patterns) |

The primary loss is spring physics. For the use cases in this project — dialog fades, drawer slides, content transitions — easing curves at 200ms are indistinguishable from spring animations. If future needs require spring physics (e.g., interactive gesture-driven animations), switch to a development build where reanimated works.

## Consequences

### Positive

- **Zero new dependencies.** No `react-native-reanimated`, no `react-native-worklets`, no npm overrides, no version alignment battles.
- **Works in Expo Go.** No native module conflicts. Iteration stays fast.
- **Familiar APIs.** `LayoutAnimation` is a one-liner before state changes. `Animated` API is standard React Native. No worklets, no shared values, no new mental model.
- **Android works.** `LayoutAnimation` is enabled at import time via `UIManager.setLayoutAnimationEnabledExperimental(true)`.
- **Single source of truth.** All animation presets and utilities live in `apps/mobile/lib/animations.ts`. Adding a new animation type is a one-line export.

### Negative

- **No spring physics.** Easing curves don't feel as native as spring animations. Mitigation: at 200ms, the difference is imperceptible for UI transitions. The web app uses CSS transitions — mobile already feels more native by comparison.
- **Imperative API.** Must call `configureLayoutAnimation()` or `useAnimatedBoolean()` before state changes, rather than the declarative `entering`/`exiting` props reanimated offers. Mitigation: the `useAnimatedBoolean()` hook makes this a one-line change per consumer.
- **Layout-level only for LayoutAnimation.** Can't independently animate opacity, scale, and translation with different curves using `LayoutAnimation` alone. Mitigation: use the `Animated` API for cases requiring per-property control. Both APIs are available and can be mixed.

### Files Changed

- `apps/mobile/lib/animations.ts` — new: `useAnimatedBoolean()` hook, `configureLayoutAnimation()` helper, preset configuration
- `apps/mobile/components/layout/LanguageSwitcher.tsx` — `useState(false)` → `useAnimatedBoolean()` for L1/L2 pickers
- `apps/mobile/components/layout/UserMenu.tsx` — `useState(false)` → `useAnimatedBoolean()` for user menu
- `apps/mobile/components/layout/Header.tsx` — `useState(false)` → `useAnimatedBoolean()` for hamburger drawer
- `apps/mobile/components/video/SubsSearchResults.tsx` — `useState(false)` → `useAnimatedBoolean()` for video list
- `apps/mobile/components/TokenizedText.tsx` — `configureLayoutAnimation()` before dictionary popup open/close

### Migration Path

All consumers are migrated. Future animations follow the two patterns above:

- **New show/hide component** → `useAnimatedBoolean()` for boolean state
- **Non-boolean state** → `configureLayoutAnimation()` before the setter call
- **Per-property animation** → React Native `Animated` API with `Animated.Value` + `useNativeDriver: true`

### Revisiting

If future animations require spring physics, gesture-driven interactions, or complex multi-property staggered animations, switch to a **development build** (`npx expo run:ios`) where `react-native-reanimated` works correctly, and re-apply the animation presets from the `reanimated-a`/`reanimated-c` branches. The `lib/animations.ts` file is designed to be swapped — both approaches export from the same file path.
