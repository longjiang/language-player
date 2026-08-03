/**
 * Feature flags for the SPEC-034 saved-words row API.
 *
 * NEXT_PUBLIC_SAVED_WORDS_ROW_API=1 switches web saves/deletes/hydration from
 * the full Directus blob (POST /user-data/sync) to row-level PUT/DELETE/GET on
 * /saved-words. A localStorage override (`lpSavedWordsRowApi`) allows canary
 * testing per browser without a rebuild.
 */

function envOn(name: string): boolean {
  const value = process.env[name];
  return value === '1' || value === 'true' || value === 'on';
}

export function savedWordsRowApiEnabled(): boolean {
  if (typeof window !== 'undefined') {
    const override = window.localStorage.getItem('lpSavedWordsRowApi');
    if (override !== null) {
      const v = override.trim().toLowerCase();
      return v === '1' || v === 'true' || v === 'on';
    }
  }
  return envOn('NEXT_PUBLIC_SAVED_WORDS_ROW_API');
}

/** One-time merge of anonymous localStorage words into the account on login. */
export function mergeAnonymousSavedWordsEnabled(): boolean {
  return envOn('NEXT_PUBLIC_MERGE_ANONYMOUS_SAVED_WORDS');
}
