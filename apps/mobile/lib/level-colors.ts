import { LEVEL_HEX_COLORS } from '@langplayer/shared';

const FALLBACK_COLOR = '#6b7280'; // gray-500

/**
 * Mobile level color helpers.
 * Uses LEVEL_HEX_COLORS from shared as the source of truth, matching
 * the web's level-colors.ts. Returns React Native style objects since
 * NativeWind doesn't include arbitrary Tailwind color palettes.
 */

/** Solid background + white text style for a level badge. */
export function levelBadgeStyle(numeric: number): { backgroundColor: string } {
  return { backgroundColor: LEVEL_HEX_COLORS[numeric] ?? FALLBACK_COLOR };
}
