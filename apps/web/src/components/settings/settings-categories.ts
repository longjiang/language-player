/**
 * Settings categories — the single list shared by the modal's sidebar (wide
 * screens), the modal's list view (narrow screens) and the deep-link routes
 * (`/[l1]/[l2]/settings/<category>`). Each entry maps a route segment to its
 * i18n title key.
 */
export const SETTINGS_CATEGORIES = [
  'display',
  'playback',
  'speech',
  'review',
  'search',
] as const;

export type SettingsCategory = (typeof SETTINGS_CATEGORIES)[number];

export function isSettingsCategory(value: string | null | undefined): value is SettingsCategory {
  return !!value && (SETTINGS_CATEGORIES as readonly string[]).includes(value);
}

/** i18n key for a category's title (also the detail pane's heading). */
export const SETTINGS_TITLE_KEYS: Record<SettingsCategory, string> = {
  display: 'title.display',
  playback: 'title.playback',
  speech: 'title.speech',
  review: 'title.review',
  search: 'setting.subs_search',
};
