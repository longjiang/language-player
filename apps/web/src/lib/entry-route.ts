/**
 * Build the route path for a dictionary entry page.
 *
 * Uses entry.dictionary.id (e.g. "cedict") + entry.id (e.g. "0")
 * to construct clean, non-composite routes:
 *   /en/zh/dictionary/entry/cedict/0
 *   /en/tlh/dictionary/entry/llm/a1b2c3d4e5f6
 *
 * Each entry has a scoped ID (the DB row ID, no prefix) and carries
 * a dictionary reference — no dash-parsing needed.
 */
export function buildEntryRoute(
  l1Code: string,
  l2Code: string,
  dictionaryId: string,
  entryId: string,
): string {
  return `/${l1Code}/${l2Code}/dictionary/entry/${dictionaryId}/${encodeURIComponent(entryId)}`;
}
