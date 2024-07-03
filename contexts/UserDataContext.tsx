// @/contexts/UserDataContext.tsx
import React, { createContext, useContext, useEffect, useState, ReactNode, FC } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getUserData, patchUserData } from '@/src/api/directus/user-data'; // Make sure this path is correct
import { User } from '@/src/api/directus/user'

interface Word {
  id: string;
}

interface SavedWords {
  [langCode: string]: Word[];
}

interface UserData {
  id: string;
  saved_words: SavedWords;
}

interface UserDataContextProps {
  userData: UserData | null;
  savedWords: SavedWords;
  hasSavedWord: (langCode: string, wordId: string) => boolean;
  saveWord: (langCode: string, wordId: string) => Promise<void>;
  removeSavedWord: (langCode: string, wordId: string) => Promise<void>;
}

interface UserDataProviderProps {
  children: ReactNode;
}

const UserDataContext = createContext<UserDataContextProps | undefined>(undefined);

export const UserDataProvider: FC<UserDataProviderProps> = ({ children }) => {
  const { getStoredAuthToken } = useAuth();
  const [userData, setUserData] = useState<UserData | null>(null);
  const [savedWords, setSavedWords] = useState<SavedWords>({}); // Initialize as an empty object

  useEffect(() => {
    const fetchData = async () => {
      try {
        const authToken = await getStoredAuthToken();
        if (!authToken) throw new Error('No auth token found');
        const data = await getUserData(authToken);
        if (!data) throw new Error('No user data found');
        setUserData(data as UserData);
        setSavedWords(data?.saved_words || {}); // Ensure saved words are an object
      } catch (error) {
        console.error('Error fetching user data:', error);
      }
    };

    fetchData();
  }, [getStoredAuthToken]);

  const hasSavedWord = (langCode: string, wordId: string): boolean => {
    return savedWords[langCode]?.some(word => word.id === wordId);
  };

  const saveWord = async (langCode: string, wordId: string): Promise<void> => {
    if (!userData) throw new Error('Cannot save word when user data is not initialized');
    if (!savedWords) throw new Error('Cannot save word when saved words are not initialized');

    const updatedSavedWords: SavedWords = {
      ...savedWords,
      [langCode]: [...(savedWords[langCode] || []), { id: wordId }]
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

  const removeSavedWord = async (langCode: string, wordId: string): Promise<void> => {
    if (!userData) throw new Error('Cannot remove word when user data is not initialized');
    if (!savedWords) throw new Error('Cannot remove word when saved words are not initialized');

    const updatedSavedWords: SavedWords = {
      ...savedWords,
      [langCode]: savedWords[langCode].filter(word => word.id !== wordId)
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

  return (
    <UserDataContext.Provider value={{ userData, savedWords, hasSavedWord, saveWord, removeSavedWord }}>
      {children}
    </UserDataContext.Provider>
  );
};

export const useUserData = (): UserDataContextProps => {
  const context = useContext(UserDataContext);
  if (!context) {
    throw new Error('useUserData must be used within a UserDataProvider');
  }
  return context;
};
