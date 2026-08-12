import { useState, useCallback } from 'react';
import { LayoutAnimation } from 'react-native';

// Note: `UIManager.setLayoutAnimationEnabledExperimental(true)` was removed
// here — it is a no-op under the New Architecture and only produced the
// "setLayoutAnimationEnabledExperimental is currently a no-op" LogBox warning.

/** Shared animation preset: 200ms fade with ease-in-out. */
const fadeAnimation = LayoutAnimation.create(
  200,
  LayoutAnimation.Types.easeInEaseOut,
  LayoutAnimation.Properties.opacity,
);

/**
 * Drop-in replacement for `useState(false)` for boolean show/hide state.
 * Calls `LayoutAnimation.configureNext()` before every state change
 * so the transition animates smoothly.
 *
 * @example
 * const [open, setOpen] = useAnimatedBoolean();
 * // use exactly like useState — setOpen(true) fades in, setOpen(false) fades out
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
