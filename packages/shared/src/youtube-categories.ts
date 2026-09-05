/**
 * YouTube video category id → translation key.
 *
 * YouTube assigns every video a numeric category id (the `categoryId` field of
 * the Data API `video.snippet`, stored in our DB as `youtube_videos.category`).
 * This map lists the ids that occur in the catalog (music-oriented languages
 * overwhelmingly use 10/24; the rest appear on imported channels). The full
 * reference list — including deprecated ids — lives in the Classic app
 * (`zerotohero-nuxt/lib/youtube.js`).
 *
 * Use `youTubeCategoryKey(id)` to resolve a translation key, then `t(key)` for
 * the localized label. Rare/deprecated ids resolve to `undefined` and callers
 * should fall back to a numeric label (e.g. `t('label.category_n', { n: id })`).
 */
export const YOUTUBE_CATEGORY_KEYS: Record<number, string> = {
  1: 'category.film_and_animation',
  2: 'category.autos_and_vehicles',
  10: 'category.music',
  15: 'category.pets_and_animals',
  17: 'category.sports',
  19: 'category.travel_and_events',
  20: 'category.gaming',
  22: 'category.people_and_blogs',
  23: 'category.comedy',
  24: 'category.entertainment',
  25: 'category.news_and_politics',
  26: 'category.howto_and_style',
  27: 'category.education',
  28: 'category.science_and_technology',
  29: 'category.nonprofits_and_activism',
  30: 'category.movies',
};

/** Resolve the translation key for a YouTube category id, if known. */
export function youTubeCategoryKey(id: number): string | undefined {
  return YOUTUBE_CATEGORY_KEYS[id];
}

/**
 * Resolve the localized name of a YouTube category id.
 * `t` is the platform translation function (web `useT()` / mobile `useT()`).
 * Falls back to `fallback(id)` when the id is unknown.
 */
export function youTubeCategoryLabel(
  id: number,
  t: (key: string, values?: Record<string, string | number>) => string,
  fallback?: (id: number) => string,
): string {
  const key = YOUTUBE_CATEGORY_KEYS[id];
  if (key) {
    const label = t(key);
    if (label && label !== key) return label;
  }
  return fallback ? fallback(id) : String(id);
}
