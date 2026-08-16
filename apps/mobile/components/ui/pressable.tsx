import React, { forwardRef } from 'react';
import { Pressable as RNPressable, type PressableProps, type View } from 'react-native';

/**
 * App-wide Pressable with a default pressed state.
 *
 * React Native's Pressable renders no visual feedback on its own. Most
 * interactive elements in the app were raw Pressables with no `active:`
 * class or pressed style, so taps felt dead. This wrapper applies a subtle
 * opacity dim (active:opacity-70) whenever the caller hasn't supplied their
 * own pressed feedback (`active:` class or a style function).
 */
export const Pressable = forwardRef<View, PressableProps>(function Pressable(
  { className, style, ...props },
  ref,
) {
  const hasOwnFeedback =
    (typeof className === 'string' && className.includes('active:')) ||
    typeof style === 'function';
  const mergedClassName = hasOwnFeedback
    ? className
    : `${className ?? ''} active:opacity-70`.trim();
  return <RNPressable ref={ref} className={mergedClassName} style={style} {...props} />;
});
