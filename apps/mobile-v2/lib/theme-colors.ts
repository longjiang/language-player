import { darkSemantic, hslToHex } from '@langplayer/shared';

/** Icon color derived from dark theme muted-foreground token. */
export const ICON_MUTED = hslToHex(darkSemantic.mutedForeground);

/** Primary foreground (white in both themes). */
export const ICON_ON_PRIMARY = hslToHex(darkSemantic.primaryForeground);

/** Placeholder text color. */
export const PLACEHOLDER_COLOR = hslToHex(darkSemantic.mutedForeground);

/** Destructive/error color. */
export const ICON_DESTRUCTIVE = hslToHex(darkSemantic.destructive);
