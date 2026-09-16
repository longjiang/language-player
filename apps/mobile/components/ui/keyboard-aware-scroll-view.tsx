import React from 'react';
import { KeyboardAwareScrollView as RNKeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { cssInterop } from 'nativewind';

/**
 * `KeyboardAwareScrollView` (react-native-keyboard-controller) with NativeWind
 * support.
 *
 * Use this instead of a plain `ScrollView` for any scrollable surface that hosts
 * `TextInput`s: it insets itself for the software keyboard and scrolls the
 * focused input into view, on both platforms (the plain `ScrollView` does
 * neither, which is how an input ends up stuck behind the keyboard with no
 * scroll range left to reach it — see SPEC-066 and SPEC-095).
 *
 * The library component is a third-party component, so NativeWind does not map
 * its class props on its own; the `cssInterop` call registers `className` →
 * `style` and `contentContainerClassName` → `contentContainerStyle` once for
 * every consumer, the same way `GlyphText` registers its own mapping.
 */
cssInterop(RNKeyboardAwareScrollView, {
  className: 'style',
  contentContainerClassName: 'contentContainerStyle',
});

export const KeyboardAwareScrollView = RNKeyboardAwareScrollView;

export type KeyboardAwareScrollViewProps = React.ComponentProps<typeof RNKeyboardAwareScrollView>;
