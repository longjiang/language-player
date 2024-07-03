// @/utils/savedWords.ts
import { SavedWords, SavedWordMeta, UserData } from '@/types';
import { getUserData, patchUserData } from '@/src/api/directus/user-data';
import { useAuth } from '@/contexts/AuthContext';

export const hasSavedWord = (savedWords: SavedWords, langCode: string, wordId: string): boolean => {
  return savedWords[langCode]?.some(word => word.id === wordId);
};

export const saveWord = async (
  savedWords: SavedWords,
  setSavedWords: React.Dispatch<React.SetStateAction<SavedWords>>,
  userData: UserData | null,
  langCode: string,
  word: SavedWordMeta,
  getStoredAuthToken: () => Promise<string | null>
): Promise<void> => {
  if (!userData) throw new Error('Cannot save word when user data is not initialized');
  if (!savedWords) throw new Error('Cannot save word when saved words are not initialized');

  const updatedSavedWords: SavedWords = {
    ...savedWords,
    [langCode]: [...(savedWords[langCode] || []), word],
  };

  setSavedWords(updatedSavedWords);
  try {
    const authToken = await getStoredAuthToken();
    if (!authToken) throw new Error('No auth token found');
    await patchUserData(Number(userData.id), { saved_words: JSON.stringify(updatedSavedWords) }, authToken);
  } catch (error) {
    console.error('Error updating user data:', error);
  }
};

export const removeSavedWord = async (
  savedWords: SavedWords,
  setSavedWords: React.Dispatch<React.SetStateAction<SavedWords>>,
  userData: UserData | null,
  langCode: string,
  wordId: string,
  getStoredAuthToken: () => Promise<string | null>
): Promise<void> => {
  if (!userData) throw new Error('Cannot remove word when user data is not initialized');
  if (!savedWords) throw new Error('Cannot remove word when saved words are not initialized');

  const updatedSavedWords: SavedWords = {
    ...savedWords,
    [langCode]: savedWords[langCode].filter(word => word.id !== wordId),
  };

  setSavedWords(updatedSavedWords);
  try {
    const authToken = await getStoredAuthToken();
    if (!authToken) throw new Error('No auth token found');
    await patchUserData(Number(userData.id), { saved_words: JSON.stringify(updatedSavedWords) }, authToken);
  } catch (error) {
    console.error('Error updating user data:', error);
  }
};
