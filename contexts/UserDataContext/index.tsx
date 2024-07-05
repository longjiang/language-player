// @/contexts/UserDataContext

import React, { createContext, useContext, useEffect, useState, ReactNode, FC } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getUserData, initializeUserData, patchUserData } from '@/src/api/directus/user-data';
import { hasSavedWord, saveWord, removeSavedWord, SavedWords, SavedWordMeta } from './savedWords';
import { getProgress, updateProgress, Progress } from './progress';
import { useLanguage } from '@/contexts/LanguageContext';
import { storageManager } from "@/src/StorageManager";

const UPDATE_INTERVAL = 1000; // 1 second

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
  const { isAuthenticated } = useAuth();
  const [userData, setUserData] = useState<UserData | null>(null);
  const [savedWords, setSavedWords] = useState<SavedWords>({});
  const [progress, setProgress] = useState<Progress>({});
  const { l2Lang } = useLanguage();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const authToken = storageManager.getAuthToken();
        if (!authToken) throw new Error('No auth token found');
        let data = await getUserData(authToken);

        if (!data) {
          data = await initializeUserData(authToken);
        }

        await storageManager.setUserData(data as UserData);
        setUserData(data as UserData);
        setSavedWords(data?.saved_words || {});
        setProgress(data?.progress || {});
      } catch (error) {
        console.error('Error fetching user data:', error);
      }
    };

    if (isAuthenticated) fetchData();
  }, [isAuthenticated]);

  useEffect(() => {
    const updateLocalProgress = () => {
      if (l2Lang && userData) {
        const langCode = l2Lang.code;
        let currentProgress = getProgress(progress, langCode);

        if (!currentProgress) {
          currentProgress = { level: undefined, time: 0 };
          const newProgress = { ...progress, [langCode]: currentProgress };
          setProgress(newProgress);
        } else {
          currentProgress.time += UPDATE_INTERVAL;
          const newProgress = { ...progress, [langCode]: currentProgress };
          setProgress(newProgress);
        }
      }
    };

    const localUpdateInterval = setInterval(updateLocalProgress, UPDATE_INTERVAL);

    const serverSyncInterval = setInterval(async () => {
      try {
        const authToken = storageManager.getAuthToken();
        if (!authToken || !userData) return;

        const updatedData = {
          saved_words: JSON.stringify(savedWords),
          progress: JSON.stringify(progress),
        };

        await patchUserData(Number(userData.id), updatedData, authToken);
        await storageManager.setUserData({ ...userData, saved_words: savedWords, progress });
      } catch (error) {
        console.error('Error syncing user data with server:', error);
      }
    }, 60000);

    return () => {
      clearInterval(localUpdateInterval);
      clearInterval(serverSyncInterval);
    };
  }, [userData, progress, savedWords, l2Lang]);

  return (
    <UserDataContext.Provider
      value={{
        userData,
        savedWords,
        progress,
        hasSavedWord: (langCode: string, wordId: string) => hasSavedWord(savedWords, langCode, wordId),
        saveWord: async (langCode: string, word: SavedWordMeta) => {
          await saveWord(savedWords, setSavedWords, userData, langCode, word, storageManager.getAuthToken);
          await storageManager.setUserData({ ...userData!, saved_words: savedWords });
        },
        removeSavedWord: async (langCode: string, wordId: string) => {
          await removeSavedWord(savedWords, setSavedWords, userData, langCode, wordId, storageManager.getAuthToken);
          await storageManager.setUserData({ ...userData!, saved_words: savedWords });
        },
        getProgress: (langCode: string) => getProgress(progress, langCode),
        updateProgress: async (langCode: string, newProgress: { level: string; time: number }) => {
          await updateProgress(progress, setProgress, userData, langCode, newProgress, storageManager.getAuthToken);
          await storageManager.setUserData({ ...userData!, progress });
        },
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