// @/contexts/UserDataContext

import React, { createContext, useContext, useEffect, useState, ReactNode, FC } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getUserData, initializeUserData, patchUserData } from '@/src/api/directus/user-data';
import { hasSavedWord, saveWord, removeSavedWord, SavedWords, SavedWordMeta } from './savedWords';
import { getProgress, updateProgress, Progress } from './progress';
import { useLanguage } from '@/contexts/LanguageContext';

// Define interfaces for UserData and context props
export interface UserData {
  id: string;
  saved_words: SavedWords;
  progress: Progress;
}

interface UserDataContextProps {
  userData: UserData | null;
  savedWords: SavedWords;
  progress: Progress;
  hasSavedWord: (langCode: string, wordId: string) => boolean;
  saveWord: (langCode: string, word: SavedWordMeta) => Promise<void>;
  removeSavedWord: (langCode: string, wordId: string) => Promise<void>;
  getProgress: (langCode: string) => { level: string; time: number } | undefined;
  updateProgress: (langCode: string, newProgress: { level: string; time: number }) => Promise<void>;
}

interface UserDataProviderProps {
  children: ReactNode;
}

// Create the context
const UserDataContext = createContext<UserDataContextProps | undefined>(undefined);

export const UserDataProvider: FC<UserDataProviderProps> = ({ children }) => {
  const { getStoredAuthToken, isAuthenticated } = useAuth();
  const [userData, setUserData] = useState<UserData | null>(null);
  const [savedWords, setSavedWords] = useState<SavedWords>({});
  const [progress, setProgress] = useState<Progress>({});
  const { l2Lang, setL2Lang } = useLanguage();

  // Effect: Fetch user data on component mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        const authToken = await getStoredAuthToken();
        if (!authToken) throw new Error('No auth token found');
        let data = await getUserData(authToken);

        // Initialize user data if it doesn't exist
        if (!data) {
          data = await initializeUserData(authToken);
        }

        setUserData(data as UserData);
        setSavedWords(data?.saved_words || {});
        setProgress(data?.progress || {});
      } catch (error) {
        console.error('Error fetching user data:', error);
      }
    };

    if (isAuthenticated) fetchData();
  }, [getStoredAuthToken, isAuthenticated]);

  // Effect: Handle local progress updates and server synchronization
  useEffect(() => {
    // Function to update local progress
    const updateLocalProgress = () => {
      if (l2Lang && userData) {
        const langCode = l2Lang.code;
        let currentProgress = getProgress(progress, langCode);

        // Initialize progress for new language if it doesn't exist
        if (!currentProgress) {
          currentProgress = { level: undefined, time: 0 };
          const newProgress = { ...progress, [langCode]: currentProgress };
          setProgress(newProgress);
        } else {
          currentProgress.time += 1000;
          const newProgress = { ...progress, [langCode]: currentProgress };
          setProgress(newProgress);
        }
      }
    };

    // Set up interval for local progress updates (every 1 second)
    const localUpdateInterval = setInterval(updateLocalProgress, 1000);

    // Set up interval for server synchronization (every 1 minute)
    const serverSyncInterval = setInterval(async () => {
      try {
        const authToken = await getStoredAuthToken();
        if (!authToken || !userData) return;

        const updatedData = {
          saved_words: JSON.stringify(savedWords),
          progress: JSON.stringify(progress),
        };

        await patchUserData(Number(userData.id), updatedData, authToken);
      } catch (error) {
        console.error('Error syncing user data with server:', error);
      }
    }, 60000);

    // Clean up intervals on component unmount
    return () => {
      clearInterval(localUpdateInterval);
      clearInterval(serverSyncInterval);
    };
  }, [userData, progress, savedWords, l2Lang, getStoredAuthToken]);

  // Provide context value
  return (
    <UserDataContext.Provider
      value={{
        userData,
        savedWords,
        progress,
        hasSavedWord: (langCode: string, wordId: string) => hasSavedWord(savedWords, langCode, wordId),
        saveWord: (langCode: string, word: SavedWordMeta) => saveWord(savedWords, setSavedWords, userData, langCode, word, getStoredAuthToken),
        removeSavedWord: (langCode: string, wordId: string) => removeSavedWord(savedWords, setSavedWords, userData, langCode, wordId, getStoredAuthToken),
        getProgress: (langCode: string) => getProgress(progress, langCode),
        updateProgress: (langCode: string, newProgress: { level: string; time: number }) => updateProgress(progress, setProgress, userData, langCode, newProgress, getStoredAuthToken),
      }}
    >
      {children}
    </UserDataContext.Provider>
  );
};

// Custom hook to use the UserDataContext
export const useUserData = (): UserDataContextProps => {
  const context = useContext(UserDataContext);
  if (!context) {
    throw new Error('useUserData must be used within a UserDataProvider');
  }
  return context;
};