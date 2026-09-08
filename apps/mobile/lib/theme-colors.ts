import { colors, darkSemantic, hslToHex } from '@langplayer/shared';

/**
 * Muted icon / placeholder color. The `muted-foreground` semantic token is now
 * a translucent pure black/white (see tokens.ts MUTED_FOREGROUND_ALPHA), which
 * is only correct over the matching theme background. These static exports are
 * used in both light and dark themes (settings, profile, login), so they stay a
 * theme-agnostic neutral gray derived from the shared raw scale rather than the
 * themed token.
 */
const MUTED_NEUTRAL = hslToHex(colors.neutral[400]);

/** Icon color derived from a theme-agnostic muted gray (see MUTED_NEUTRAL). */
export const ICON_MUTED = MUTED_NEUTRAL;

/** Primary foreground (white in both themes). */
export const ICON_ON_PRIMARY = hslToHex(darkSemantic.primaryForeground);

/** Accent foreground (white in both themes). */
export const ICON_ON_ACCENT = hslToHex(darkSemantic.accentForeground);

/** Primary brand color (derived from dark theme design tokens). */
export const ICON_PRIMARY = hslToHex(darkSemantic.primary);

/** Placeholder text color. */
export const PLACEHOLDER_COLOR = MUTED_NEUTRAL;

/** Destructive/error color. */
export const ICON_DESTRUCTIVE = hslToHex(darkSemantic.destructive);

/** Warning/amber color (pro badges, attention indicators). */
export const ICON_WARNING = hslToHex(darkSemantic.warning);

/** Saved word bookmark — amber-500 filled. */
export const ICON_SAVED = hslToHex(darkSemantic.warning);

/** Unsaved word bookmark — amber-500 wireframe (no fill). */
export const ICON_UNSAVED = hslToHex(darkSemantic.warning);
