// @/contexts/UserDataContext.tsx

import React, { createContext, useContext, useEffect, useState, ReactNode, FC } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getUserData, initializeUserData, patchUserData } from '@/src/api/directus/user-data';
import { useLanguage } from '@/contexts/LanguageContext';
import { storageManager } from "@/src/StorageManager";

const UPDATE_INTERVAL = 1000; // 1 second

export interface Context {
  form: string;
  starttime?: number;
  youtube_id?: string;
  text?: string;
}

export interface SavedWordMeta {
  id: string;
  forms: string[];
  date: number;
  context: Context;
}

export interface SavedWords {
  [langCode: string]: SavedWordMeta[];
}

export interface Progress {
  [langCode: string]: {
    level?: string;
    time: number; // milliseconds
  };
}

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

const UserDataContext = createContext<UserDataContextProps | undefined>(undefined);

export const UserDataProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const [userData, setUserData] = useState<UserData | null>(null);
  const { l2Lang } = useLanguage();

  const fetchAndSetUserData = async () => {
    try {
      const authToken = storageManager.getAuthToken();
      if (!authToken) throw new Error('No auth token found');
      let data = await getUserData(authToken);

      if (!data) {
        data = await initializeUserData(authToken);
      }

      await storageManager.setUserData(data as UserData);
      setUserData(data as UserData);
    } catch (error) {
      console.error('Error fetching user data:', error);
    }
  };

  useEffect(() => {
    if (isAuthenticated) fetchAndSetUserData();
  }, [isAuthenticated]);

  useEffect(() => {
    const updateLocalProgress = () => {
      if (l2Lang && userData) {
        const langCode = l2Lang.code;
        let currentProgress = userData.progress[langCode];

        if (!currentProgress) {
          currentProgress = { level: undefined, time: 0 };
        } else {
          currentProgress.time += UPDATE_INTERVAL;
        }

        setUserData(prevData => ({
          ...prevData!,
          progress: {
            ...prevData!.progress,
            [langCode]: currentProgress
          }
        }));
      }
    };

    const localUpdateInterval = setInterval(updateLocalProgress, UPDATE_INTERVAL);

    const serverSyncInterval = setInterval(async () => {
      try {
        if (!userData) return;
        const authToken = storageManager.getAuthToken();
        if (!authToken) throw new Error('No auth token found');

        await patchUserData(Number(userData.id), {
          saved_words: JSON.stringify(userData.saved_words),
          progress: JSON.stringify(userData.progress),
        }, authToken);
        
        await storageManager.setUserData(userData);
      } catch (error) {
        console.error('Error syncing user data with server:', error);
      }
    }, 60000);

    return () => {
      clearInterval(localUpdateInterval);
      clearInterval(serverSyncInterval);
    };
  }, [userData, l2Lang]);

  const hasSavedWord = (langCode: string, wordId: string): boolean => {
    return userData?.saved_words[langCode]?.some(word => word.id === wordId) || false;
  };

  const saveWord = async (langCode: string, word: SavedWordMeta): Promise<void> => {
    if (!userData) throw new Error('Cannot save word when user data is not initialized');

    const updatedSavedWords = {
      ...userData.saved_words,
      [langCode]: [...(userData.saved_words[langCode] || []), word],
    };

    const updatedUserData = {
      ...userData,
      saved_words: updatedSavedWords,
    };

    setUserData(updatedUserData);
    await storageManager.setUserData(updatedUserData);

    try {
      const authToken = storageManager.getAuthToken();
      if (!authToken) throw new Error('No auth token found');
      await patchUserData(Number(userData.id), { saved_words: JSON.stringify(updatedSavedWords) }, authToken);
    } catch (error) {
      console.error('Error updating user data:', error);
    }
  };

  const removeSavedWord = async (langCode: string, wordId: string): Promise<void> => {
    if (!userData) throw new Error('Cannot remove word when user data is not initialized');

    const updatedSavedWords = {
      ...userData.saved_words,
      [langCode]: userData.saved_words[langCode].filter(word => word.id !== wordId),
    };

    const updatedUserData = {
      ...userData,
      saved_words: updatedSavedWords,
    };

    setUserData(updatedUserData);
    await storageManager.setUserData(updatedUserData);

    try {
      const authToken = storageManager.getAuthToken();
      if (!authToken) throw new Error('No auth token found');
      await patchUserData(Number(userData.id), { saved_words: JSON.stringify(updatedSavedWords) }, authToken);
    } catch (error) {
      console.error('Error updating user data:', error);
    }
  };

  const getProgress = (langCode: string) => {
    return userData?.progress[langCode];
  };

  const updateProgress = async (langCode: string, newProgress: { level: string; time: number }): Promise<void> => {
    if (!userData) throw new Error('Cannot update progress when user data is not initialized');

    const updatedProgress = {
      ...userData.progress,
      [langCode]: newProgress,
    };

    const updatedUserData = {
      ...userData,
      progress: updatedProgress,
    };

    setUserData(updatedUserData);
    await storageManager.setUserData(updatedUserData);

    try {
      const authToken = storageManager.getAuthToken();
      if (!authToken) throw new Error('No auth token found');
      await patchUserData(Number(userData.id), { progress: JSON.stringify(updatedProgress) }, authToken);
    } catch (error) {
      console.error('Error updating user data:', error);
    }
  };

  return (
    <UserDataContext.Provider
      value={{
        userData,
        savedWords: userData?.saved_words || {},
        progress: userData?.progress || {},
        hasSavedWord,
        saveWord,
        removeSavedWord,
        getProgress,
        updateProgress,
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