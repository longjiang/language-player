/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Swatches } from './Swatches';  // Assuming Swatches are defined in the same file or imported appropriately

export const Colors = {
  light: {
    primaryText: Swatches.neutral[0],
    secondaryText: Swatches.neutral[300],
    primaryBackground: Swatches.neutral[0],
    secondaryBackground: Swatches.neutral[50],
    tertiaryBackground: Swatches.neutral[100],
    primaryBrand: Swatches.primary[600],
    secondaryBrand: Swatches.success[600],
    tertiaryBrand: Swatches.warning[600],
    alternateBrand: Swatches.alert[600],
    accent1: Swatches.primary[400],
    accent2: Swatches.success[400],
    accent3: Swatches.warning[400],
    accent4: Swatches.alert[400],
    semanticSuccess: Swatches.success[600],
    semanticError: Swatches.alert[600],
    semanticWarning: Swatches.warning[600],
    semanticInfo: Swatches.neutral[300],
    primaryStroke: Swatches.neutral[200],
    secondaryStroke: Swatches.neutral[100],
    primaryLink: Swatches.primary[400],
    secondaryLink: Swatches.primary[700],
    level: {
      1: Swatches.warning[500],
      2: '#1E7E94',
      3: '#FA6234',
      4: Swatches.alert[500],
      5: '#FA6234',
      6: Swatches.primary[400],
      7: Swatches.success[600],
    }
  },
  dark: {
    primaryText: Swatches.neutral[0],
    secondaryText: Swatches.neutral[200],
    primaryBackground: Swatches.neutral[900],
    secondaryBackground: Swatches.neutral[600],
    tertiaryBackground: Swatches.neutral[700],
    primaryBrand: Swatches.primary[500],
    secondaryBrand: Swatches.success[500],
    tertiaryBrand: Swatches.warning[500],
    alternateBrand: Swatches.alert[500],
    accent1: Swatches.primary[700],
    accent2: Swatches.success[700],
    accent3: Swatches.warning[700],
    accent4: Swatches.alert[700],
    semanticSuccess: Swatches.success[600],
    semanticError: Swatches.alert[500],
    semanticWarning: Swatches.warning[500],
    semanticInfo: Swatches.neutral[300],
    primaryStroke: Swatches.neutral[300],
    secondaryStroke: Swatches.neutral[400],
    primaryLink: Swatches.primary[300],
    secondaryLink: Swatches.primary[600],
    level: {
      1: Swatches.warning[500],
      2: '#1E7E94',
      3: '#FA6234',
      4: Swatches.alert[500],
      5: '#FA6234',
      6: Swatches.primary[400],
      7: Swatches.success[600],
    }
  }
};

export default Colors;
