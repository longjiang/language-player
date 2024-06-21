/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Swatches } from './Swatches';  // Assuming Swatches are defined in the same file or imported appropriately

export const Colors = {
  light: {
    text: {
      primary: Swatches.neutral[0],
      secondary: Swatches.neutral[300],
    },
    background: {
      primary: Swatches.neutral[0],
      secondary: Swatches.neutral[50],
    },
    brand: {
      primary: Swatches.primary[600],
      secondary: Swatches.success[600],
      tertiary: Swatches.warning[600],
      alternate: Swatches.alert[600],
    },
    accent: {
      accent1: Swatches.primary[400],
      accent2: Swatches.success[400],
      accent3: Swatches.warning[400],
      accent4: Swatches.alert[400],
    },
    semantic: {
      success: Swatches.success[600],
      error: Swatches.alert[600],
      warning: Swatches.warning[600],
      info: Swatches.neutral[300],
    },
    stroke: {
      primary: Swatches.neutral[200],
      secondary: Swatches.neutral[100],
    },
    link: {
      primary: Swatches.primary[400],
      secondary: Swatches.primary[700],
    },
  },
  dark: {
    text: {
      primary: Swatches.neutral[0],
      secondary: Swatches.neutral[200],
    },
    background: {
      primary: Swatches.neutral[900],
      secondary: Swatches.neutral[600],
    },
    brand: {
      primary: Swatches.primary[500],
      secondary: Swatches.success[500],
      tertiary: Swatches.warning[500],
      alternate: Swatches.alert[500],
    },
    accent: {
      accent1: Swatches.primary[700],
      accent2: Swatches.success[700],
      accent3: Swatches.warning[700],
      accent4: Swatches.alert[700],
    },
    semantic: {
      success: Swatches.success[600],
      error: Swatches.alert[500],
      warning: Swatches.warning[500],
      info: Swatches.neutral[300],
    },
    stroke: {
      primary: Swatches.neutral[300],
      secondary: Swatches.neutral[400],
    },
    link: {
      primary: Swatches.primary[300],
      secondary: Swatches.primary[600],
    },
  }
};

export default Colors;
