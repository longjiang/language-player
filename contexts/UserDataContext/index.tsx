import React, { createContext, useContext, useEffect, useState, ReactNode, FC } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getUserData, initializeUserData } from '@/src/api/directus/user-data';
import { hasSavedWord, saveWord, removeSavedWord, SavedWords, SavedWordMeta } from './savedWords';
import { getProgress, updateProgress, Progress } from './progress';
import { useLanguage } from '@/contexts/LanguageContext';

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

const UserDataContext = createContext<UserDataContextProps | undefined>(undefined);

export const UserDataProvider: FC<UserDataProviderProps> = ({ children }) => {
  const { getStoredAuthToken } = useAuth();
  const [userData, setUserData] = useState<UserData | null>(null);
  const [savedWords, setSavedWords] = useState<SavedWords>({});
  const [progress, setProgress] = useState<Progress>({});
  const { l2Lang } = useLanguage();

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

    fetchData();
  }, [getStoredAuthToken]);

  useEffect(() => {
    const intervalId = setInterval(async () => {
      if (l2Lang && userData) {
        const langCode = l2Lang.code;
        let currentProgress = getProgress(progress, langCode);

        // Initialize progress for new language if it doesn't exist
        if (!currentProgress) {
          currentProgress = { level: '1', time: 0 };
          const newProgress = { ...progress, [langCode]: currentProgress };
          setProgress(newProgress);
          await updateProgress(newProgress, setProgress, userData, langCode, currentProgress, getStoredAuthToken);
        }

        const newTime = currentProgress.time + 1000;
        await updateProgress(progress, setProgress, userData, langCode, { level: currentProgress.level, time: newTime }, getStoredAuthToken);
      }
    }, 1000);

    return () => clearInterval(intervalId);
  }, [userData, progress, l2Lang]);

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

export const useUserData = (): UserDataContextProps => {
  const context = useContext(UserDataContext);
  if (!context) {
    throw new Error('useUserData must be used within a UserDataProvider');
  }
  return context;
};
