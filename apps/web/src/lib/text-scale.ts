/**
 * Map zoom index (0–7) to rem values: 1rem (16px) to 2.25rem (36px).
 * Single source of truth for the tokenized-text zoom setting — kept outside
 * TokenizedText so hooks like useTextScale don't create an import cycle with
 * the components that consume them.
 */
export const ZOOM_TO_REM = [1, 1.125, 1.25, 1.375, 1.5, 1.75, 2, 2.25] as const;
