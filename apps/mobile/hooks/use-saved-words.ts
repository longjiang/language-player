/**
 * This hook is a thin wrapper around the SavedWordsContext.
 * All saved-words state is managed centrally by SavedWordsProvider.
 */
import { useSavedWordsContext } from '@/contexts/SavedWordsContext';

export function useSavedWords(_activeL2?: string) {
  return useSavedWordsContext();
}
