import { Swatches } from './Swatches';

const LevelColors = {
  light: [
    null, // Levels are 1-indexed
    Swatches.warning[500],
    '#1E7E94',
    '#FA6234',
    Swatches.alert[500],
    '#FA6234',
    Swatches.primary[400],
    Swatches.success[600],
  ],
  dark: [
    null, // Levels are 1-indexed
    Swatches.warning[500],
    '#1E7E94',
    '#FA6234',
    Swatches.alert[500],
    '#FA6234',
    Swatches.primary[400],
    Swatches.success[600],
  ]
};


export const Colors = {
  light: {
    primaryText: Swatches.neutral[900],
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
  }
};

// Export Levels separately
export { LevelColors };

export default Colors;