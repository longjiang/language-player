/**
 * Curated reading suggestions for the Web Reader.
 *
 * Per-language curated lists live in ./data/*.json and are merged with
 * derived MediaWiki defaults (see ./wiki.ts) so every supported L2 has at
 * least one suggestion without manual curation.
 */

/** UI category labels are translated via title.{category} keys. */
export const READING_CATEGORIES = ['wikipedia', 'news', 'fiction', 'articles', 'guides', 'blogs'] as const;

export type ReadingCategory = (typeof READING_CATEGORIES)[number];

export interface ReadingSuggestionItem {
  /**
   * Absolute URL that survives the reader pipeline: public HTML, server-
   * rendered (no login wall, no client-side-only content), reachable by the
   * Flask proxy's plain GET.
   */
  url: string;
  /**
   * Link label shown to the user. Kept in the target language — it is
   * content (an article/story title), not UI chrome, so it is not translated.
   */
  title: string;
}

/** Category → suggested links. Omitted categories are simply not shown. */
export type ReadingSuggestions = Partial<Record<ReadingCategory, ReadingSuggestionItem[]>>;
