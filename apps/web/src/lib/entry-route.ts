/**
 * Build the route path for a dictionary entry page.
 *
 * Uses entry.dictionary.id (e.g. "cedict") + entry.id (e.g. "0")
 * to construct clean, non-composite routes:
 *   /en/zh/dictionary/entry/cedict/0
 *   /en/tlh/dictionary/entry/llm/a1b2c3d4e5f6
 *
 * CEDICT entry IDs contain commas (Classic format: {trad},{pinyin},{idx}).
 * Commas break Next.js route matching, so we encode them as ~ in the URL path.
 * The entry page reverses this before calling the API.
 */
export function buildEntryRoute(
  l1Code: string,
  l2Code: string,
  dictionaryId: string,
  entryId: string,
): string {
  // Replace commas with ~ for Next.js route compatibility (commas break routing)
  const safeId = entryId.replace(/,/g, '~');
  return `/${l1Code}/${l2Code}/dictionary/entry/${dictionaryId}/${encodeURIComponent(safeId)}`;
}
