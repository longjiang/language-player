/**
 * Video-tag helpers shared by web and mobile.
 *
 * A video's `tags` column is a comma-separated string (e.g. `東京,ニュース,TOKYOMX`).
 * Search treats a query that starts with `#` as a tag search, so the same string
 * (`#ニュース`) can live in the search field, the shareable URL (`?q=%23ニュース`),
 * and the watch page's tag pills.
 */

/** Prefix that marks a search query as a tag search. */
export const TAG_SEARCH_PREFIX = '#';

/** Split a video's comma-separated `tags` column into unique tag labels.
 *  Tags are compared case-insensitively (YouTube tags are case-insensitive),
 *  keeping the first spelling and the original order. */
export function parseVideoTags(tags: string | null | undefined): string[] {
  if (!tags) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of tags.split(',')) {
    const tag = raw.trim();
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(tag);
  }
  return result;
}

/** True when the query should be run against video tags instead of titles. */
export function isTagSearchQuery(query: string): boolean {
  return query.trim().startsWith(TAG_SEARCH_PREFIX);
}

/** The search-field value for a tag: `news` → `#news`. */
export function formatTagSearchQuery(tag: string): string {
  return TAG_SEARCH_PREFIX + tag.trim();
}

/** The bare tag behind a tag search query: `#news` → `news`. Non-tag queries
 *  are returned trimmed, unchanged. */
export function parseTagSearchQuery(query: string): string {
  const trimmed = query.trim();
  return trimmed.startsWith(TAG_SEARCH_PREFIX) ? trimmed.slice(TAG_SEARCH_PREFIX.length).trim() : trimmed;
}
