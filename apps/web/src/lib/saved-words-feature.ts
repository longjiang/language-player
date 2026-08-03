/**
 * Optional toggle for the SPEC-034 saved-words migration: merge anonymous
 * localStorage words into the account once on first login after release.
 */
export function mergeAnonymousSavedWordsEnabled(): boolean {
  const value = process.env.NEXT_PUBLIC_MERGE_ANONYMOUS_SAVED_WORDS;
  return value === '1' || value === 'true' || value === 'on';
}
