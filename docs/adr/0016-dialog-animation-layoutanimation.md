# ADR-0016: Mobile Dialog Animations — LayoutAnimation over react-native-reanimated

**Date**: 2026-07-26
**Status**: accepted
**Supersedes**: ADR-0014 (animation section for mobile)
**Branches**: `reanimated-a`, `reanimated-b`, `reanimated-c` (experiments), `layout-animation-dialog` (implementation)

## Context

ADR-0014 specified `react-native-reanimated` for mobile dialog enter/exit animations using spring physics. The plan was to import `FadeIn`, `FadeOut`, `SlideInDown`, and `SlideOutDown` presets and apply them via `Animated.View`'s `entering`/`exiting` props.

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

**Use React Native's built-in `LayoutAnimation` API for dialog enter/exit transitions instead of `react-native-reanimated`.**

### How it works

`LayoutAnimation.configureNext()` tells React Native to animate the next layout change automatically. Calling it before `setOpen(true)` fades the dialog in; calling it before `setOpen(false)` fades it out. No native modules, no babel plugins, no additional dependencies.

**Implementation** (`apps/mobile/lib/animations.ts`):

```tsx
import { useState, useCallback } from 'react';
import { LayoutAnimation, Platform, UIManager } from 'react-native';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const dialogAnimation = LayoutAnimation.create(
  200,
  LayoutAnimation.Types.easeInEaseOut,
  LayoutAnimation.Properties.opacity,
);

export function useDialogOpen(initial = false) {
  const [open, setOpen] = useState(initial);
  const animatedSetOpen = useCallback((value: boolean) => {
    LayoutAnimation.configureNext(dialogAnimation);
    setOpen(value);
  }, []);
  return [open, animatedSetOpen] as const;
}
```

**Consumer usage** — drop-in replacement for `useState(false)`:

```tsx
// Before
const [open, setOpen] = useState(false);

// After
const [open, setOpen] = useDialogOpen();
```

The animation preset uses `easeInEaseOut` with `opacity` property, producing a smooth fade transition. Duration is 200ms — fast enough to feel responsive, long enough to be visible.

### Trade-offs vs react-native-reanimated

| Concern | react-native-reanimated | LayoutAnimation |
|---|---|---|
| Install complexity | Dependency hell in monorepo + Expo Go | Built-in, zero deps |
| Expo Go compatibility | ❌ Crashes | ✅ Works |
| Animation quality | Spring physics, 60fps | Easing curves, 60fps |
| Enter/exit API | `entering`/`exiting` props | `configureNext()` before state change |
| Separate enter/exit config | Yes (different presets) | No (same animation for open/close) |
| Per-property control | Individual opacity/translate/scale | Layout-level only |

`LayoutAnimation` animates the entire layout change — it can't apply different timing to opacity vs. position. For dialog transitions, this is acceptable because the dialog appears in a portal (already positioned correctly) and only needs a fade. If future needs require slide-up sheet animations or staggered property animations, the decision can be revisited when switching to development builds.

## Consequences

### Positive

- **Zero new dependencies.** No `react-native-reanimated`, no `react-native-worklets`, no npm overrides, no version alignment battles.
- **Works in Expo Go.** No native module conflicts. Iteration stays fast.
- **Drop-in API.** `useDialogOpen()` has the same `[value, setter]` tuple shape as `useState(false)` — consumers change one line.
- **Android works.** The hook enables `LayoutAnimation` on Android at import time via `UIManager.setLayoutAnimationEnabledExperimental(true)`.

### Negative

- **Same animation for open and close.** Can't configure separate enter (250ms spring slide-up) and exit (150ms fade) like reanimated presets allowed. Mitigation: this is a cosmetic limitation. The dialog already fades in/out smoothly — separate timing isn't noticeable at 200ms.
- **No spring physics.** Easing curves don't feel as native as spring animations. Mitigation: at 200ms, the difference between `easeInEaseOut` and a spring is imperceptible for a simple overlay.
- **Layout-level only.** Can't independently animate opacity, scale, and translation with different curves. Mitigation: for dialogs that appear in a centered portal, a uniform fade is the correct animation.

### Files Changed

- `apps/mobile/lib/animations.ts` — new: `useDialogOpen()` hook with `LayoutAnimation`
- `apps/mobile/components/layout/LanguageSwitcher.tsx` — `useState(false)` → `useDialogOpen()` for L1/L2 picker dialogs

### Migration Path

To animate all dialog consumers, replace `useState(false)` with `useDialogOpen()` for every `open` state that controls a `Dialog.Root`:

| Component | Variable(s) | File |
|---|---|---|
| LanguageSwitcher | `l1Open`, `l2Open` | `components/layout/LanguageSwitcher.tsx` ✅ done |
| UserMenu | `open` | `components/layout/UserMenu.tsx` |
| DictionaryPopup | `open` | `components/dictionary/DictionaryPopup.tsx` |
| SubsSearchResults | `modalVisible` | `components/video/SubsSearchResults.tsx` |

### Revisiting

If dialog animations later require spring physics, per-property control, or staggered enter/exit timing, switch to a **development build** (`npx expo run:ios`) where `react-native-reanimated` works correctly, and re-apply the animation presets from the `reanimated-a`/`reanimated-c` branches. The `lib/animations.ts` file is designed to be swapped — both approaches export from the same file path.
