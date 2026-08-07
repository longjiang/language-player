/**
 * Shared constants for the mobile app.
 */

/** Matches Next.js sm: breakpoint (640px). Used for responsive layout switching. */
export const SM_BREAKPOINT = 640;

/** Matches Next.js md: breakpoint (768px). */
export const MD_BREAKPOINT = 768;

/** Matches Next.js lg: breakpoint (1024px). */
export const LG_BREAKPOINT = 1024;

/** Matches Next.js xl: breakpoint (1280px). */
export const XL_BREAKPOINT = 1280;

/**
 * Grid column count matching apps/web VideoGrid:
 * 1 <640, 2 <1024, 3 <1280, 4 ≥1280.
 */
export function gridColumnCount(width: number): number {
  if (width < SM_BREAKPOINT) return 1;
  if (width < LG_BREAKPOINT) return 2;
  if (width < XL_BREAKPOINT) return 3;
  return 4;
}
