/**
 * Shared geometry for the per-block text-action-menu trigger (the ⋮ button).
 *
 * The trigger must align with the FIRST line of the tokenized L2 text at any
 * text-size setting: the icon is as tall as the text's glyphs, and the tap
 * box spans exactly the first line's pitch, so the icon is vertically
 * centered on that line. Callers (web `text-action-menu.tsx`, mobile
 * `TextActionMenu.tsx`, and the readers' measuring mirrors) all derive the
 * same footprint from this module so the two stay in sync.
 */

/** The block-level L2 base font size in px (SPEC-051: 16px at zoom 0). */
export const L2_BASE_FONT_SIZE_PX = 16;

/** The user's leading default (SPEC-051: relaxed = 1.625). */
export const ACTION_TRIGGER_DEFAULT_LEADING = 1.625;

/** The trigger's fixed horizontal footprint in px (a square tap target). */
export const ACTION_TRIGGER_SIZE_PX = 24;

/**
 * Rendered size of the block-level L2 text in px: base 16px × the user's
 * zoom multiplier × any per-surface textScale (1.33 for single-line
 * subtitles only — SPEC-051).
 */
export function actionTriggerFontPx(zoomRem: number, textScale = 1): number {
  return L2_BASE_FONT_SIZE_PX * zoomRem * textScale;
}

/**
 * Height of the trigger's tap box in px: one line pitch of the adjacent L2
 * text (fontPx × leading), so the icon centers on the first line.
 */
export function actionTriggerBoxPx(fontPx: number, leading = ACTION_TRIGGER_DEFAULT_LEADING): number {
  return fontPx * leading;
}

/**
 * The icon's own size in px — same as the text's rendered font size, so the
 * glyph height matches the text at every zoom level.
 */
export function actionTriggerIconPx(fontPx: number): number {
  return fontPx;
}
