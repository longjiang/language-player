import { LEVEL_HEX_COLORS } from '@langplayer/shared';

/**
 * Web-specific level color helpers.
 * Converts the centralized hex colors to Tailwind classes and inline styles.
 */

/** Map 1–7 numeric level → nearest Tailwind bg class. */
const BG_CLASSES: Record<number, string> = {
  1: 'bg-amber-500',
  2: 'bg-cyan-700',
  3: 'bg-orange-600',
  4: 'bg-red-700',
  5: 'bg-blue-900',
  6: 'bg-purple-700',
  7: 'bg-rose-600',
};

/** Map 1–7 numeric level → Tailwind subtle badge classes (bg/10 + text). */
const SUBTLE_CLASSES: Record<number, string> = {
  1: 'bg-amber-500/10 text-amber-400',
  2: 'bg-cyan-700/10 text-cyan-400',
  3: 'bg-orange-600/10 text-orange-400',
  4: 'bg-red-700/10 text-red-400',
  5: 'bg-blue-900/10 text-blue-400',
  6: 'bg-purple-700/10 text-purple-400',
  7: 'bg-rose-600/10 text-rose-400',
};

/** Tailwind `data-[state=on]:` classes for toggle pill buttons. */
const PILL_CLASSES: Record<number, string> = {
  1: 'data-[state=on]:bg-amber-500 data-[state=on]:text-white',
  2: 'data-[state=on]:bg-cyan-700 data-[state=on]:text-white',
  3: 'data-[state=on]:bg-orange-600 data-[state=on]:text-white',
  4: 'data-[state=on]:bg-red-700 data-[state=on]:text-white',
  5: 'data-[state=on]:bg-blue-900 data-[state=on]:text-white',
  6: 'data-[state=on]:bg-purple-700 data-[state=on]:text-white',
  7: 'data-[state=on]:bg-rose-600 data-[state=on]:text-white',
};

const FALLBACK_CLASS = 'bg-gray-500';
const FALLBACK_SUBTLE = 'bg-gray-500/10 text-gray-400';
const FALLBACK_PILL = 'data-[state=on]:bg-gray-500 data-[state=on]:text-white';

/** Solid background color class for a level badge. */
export function levelBgClass(numeric: number): string {
  return BG_CLASSES[numeric] ?? FALLBACK_CLASS;
}

/** Subtle background + text classes for a level badge. */
export function levelSubtleClass(numeric: number): string {
  return SUBTLE_CLASSES[numeric] ?? FALLBACK_SUBTLE;
}

/** Toggle-pill classes for level filter buttons. */
export function levelPillClass(numeric: number): string {
  return PILL_CLASSES[numeric] ?? FALLBACK_PILL;
}

/** Inline style with the canonical hex color. For non-Tailwind contexts. */
export function levelHexStyle(numeric: number): { backgroundColor: string; color: string } {
  const hex = LEVEL_HEX_COLORS[numeric];
  if (!hex) return { backgroundColor: '#6b7280', color: '#fff' };
  return { backgroundColor: hex, color: '#fff' };
}

/** Re-export the canonical hex colors from shared. */
export { LEVEL_HEX_COLORS };
