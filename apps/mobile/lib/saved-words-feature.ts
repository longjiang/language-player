/**
 * Feature flag for the SPEC-034 saved-words row API.
 *
 * EXPO_PUBLIC_SAVED_WORDS_ROW_API=1 switches mobile saves/deletes/hydration
 * from the full Directus blob (POST /user-data/sync) to row-level
 * PUT/DELETE/GET on /saved-words.
 */

export function savedWordsRowApiEnabled(): boolean {
  const value = (process.env as any).EXPO_PUBLIC_SAVED_WORDS_ROW_API;
  return value === '1' || value === 'true' || value === 'on';
}
