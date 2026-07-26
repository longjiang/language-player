import { useState, useCallback } from 'react';
import { LayoutAnimation, Platform, UIManager } from 'react-native';

// Enable LayoutAnimation on Android (disabled by default)
if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/** Fade + slide-up animation preset for dialog open/close. */
const dialogAnimation = LayoutAnimation.create(
  200,
  LayoutAnimation.Types.easeInEaseOut,
  LayoutAnimation.Properties.opacity,
);

/**
 * Drop-in replacement for `useState(false)` for dialog open state.
 * Calls `LayoutAnimation.configureNext()` before every state change
 * so the dialog fades in/out smoothly.
 *
 * @example
 * const [open, setOpen] = useDialogOpen();
 * // use exactly like useState — setOpen(true) animates in, setOpen(false) animates out
 */
export function useDialogOpen(initial = false) {
  const [open, setOpen] = useState(initial);

  const animatedSetOpen = useCallback((value: boolean) => {
    LayoutAnimation.configureNext(dialogAnimation);
    setOpen(value);
  }, []);

  return [open, animatedSetOpen] as const;
}
