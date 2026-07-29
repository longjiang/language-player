import { darkSemantic, hslToHex } from '@langplayer/shared';

/** Icon color derived from dark theme muted-foreground token. */
export const ICON_MUTED = hslToHex(darkSemantic.mutedForeground);

/** Primary foreground (white in both themes). */
export const ICON_ON_PRIMARY = hslToHex(darkSemantic.primaryForeground);

/** Primary brand color (derived from dark theme design tokens). */
export const ICON_PRIMARY = hslToHex(darkSemantic.primary);

/** Placeholder text color. */
export const PLACEHOLDER_COLOR = hslToHex(darkSemantic.mutedForeground);

/** Destructive/error color. */
export const ICON_DESTRUCTIVE = hslToHex(darkSemantic.destructive);

/** Warning/amber color (pro badges, attention indicators). */
export const ICON_WARNING = hslToHex(darkSemantic.warning);

/** Saved word bookmark — amber-500 filled. */
export const ICON_SAVED = hslToHex(darkSemantic.warning);

/** Unsaved word bookmark — amber-500 wireframe (no fill). */
export const ICON_UNSAVED = hslToHex(darkSemantic.warning);
