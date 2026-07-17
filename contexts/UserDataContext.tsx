// @/contexts/UserDataContext.tsx

import React, { createContext, useContext, useEffect, useState, ReactNode, FC } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getUserData, initializeUserData, patchUserData } from '@/src/api/directus/user-data';
import { useLanguage } from '@/contexts/LanguageContext';
import { storageManager } from "@/src/StorageManager";

export const UPDATE_INTERVAL = 1000; // 1 second
export const SYNC_INTERVAL = 60000; // 1 minute

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
  getSavedWordByForm: (langCode: string, form: string) => SavedWordMeta | undefined;
  saveWord: (langCode: string, word: SavedWordMeta) => Promise<void>;
  removeSavedWord: (langCode: string, wordId: string) => Promise<void>;
  getProgress: (langCode: string) => { level: string; time: number } | undefined;
  updateProgress: (langCode: string, newProgress: { level: string; time: number }) => Promise<void>;
  getTimeFromStorage: () => Promise<number>;
  lastSignificantChange: number;
}

const UserDataContext = createContext<UserDataContextProps>({
  userData: null,
  savedWords: {},
  progress: {},
  hasSavedWord: () => false,
  getSavedWordByForm: () => undefined,
  saveWord: async () => {},
  removeSavedWord: async () => {},
  getProgress: () => undefined,
  updateProgress: async () => {},
  getTimeFromStorage: async () => 0,
  lastSignificantChange: Date.now(),
});

export const UserDataProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const [userData, setUserData] = useState<UserData | null>(null);
  const { l2Lang } = useLanguage();
  const [lastSignificantChange, setLastSignificantChange] = useState(Date.now());

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
    const updateLocalTime = async () => {
      try {
        const time = await storageManager.getTime();
        await storageManager.setTime(time + UPDATE_INTERVAL);
      } catch (error) {
        console.error('Error updating local time:', error);
      }
    };

    const localUpdateInterval = setInterval(updateLocalTime, UPDATE_INTERVAL);

    const progressUpdateInterval = setInterval(async () => {
      try {
        const time = await storageManager.getTime();
        if (l2Lang && userData) {
          const langCode = l2Lang.code;
          let currentProgress = userData.progress[langCode];

          if (!currentProgress) {
            currentProgress = { level: undefined, time: 0 };
          }

          currentProgress.time += time; // Update progress with accumulated time

          setUserData(prevData => ({
            ...prevData!,
            progress: {
              ...prevData!.progress,
              [langCode]: currentProgress
            }
          }));

          await storageManager.resetTime(); // Reset local time after updating progress
        }
      } catch (error) {
        console.error('Error updating progress:', error);
      }
    }, SYNC_INTERVAL);

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
    }, SYNC_INTERVAL);

    return () => {
      clearInterval(localUpdateInterval);
      clearInterval(progressUpdateInterval);
      clearInterval(serverSyncInterval);
    };
  }, [userData, l2Lang]);

  const hasSavedWord = (langCode: string, wordId: string): boolean => {
    return userData?.saved_words[langCode]?.some(word => word.id === wordId) || false;
  };

  // Get saved word by form
  const getSavedWordByForm = (langCode: string, form: string): SavedWordMeta | undefined => {
    return userData?.saved_words[langCode]?.find(word => word.forms.includes(form));
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
    setLastSignificantChange(Date.now()); // Update the change tracker

    try {
      const authToken = storageManager.getAuthToken();
      if (!authToken) throw new Error('No auth token found');
      await patchUserData(Number(userData.id), { progress: JSON.stringify(updatedProgress) }, authToken);
    } catch (error) {
      console.error('Error updating user data:', error);
    }
  };

  const getTimeFromStorage = async (): Promise<number> => {
    return await storageManager.getTime();
  };

  // Add an effect to update lastSignificantChange when l2Lang changes
  useEffect(() => {
    if (l2Lang) {
      setLastSignificantChange(Date.now());
    }
  }, [l2Lang]);

  return (
    <UserDataContext.Provider
      value={{
        userData,
        savedWords: userData?.saved_words || {},
        progress: userData?.progress || {},
        hasSavedWord,
        getSavedWordByForm,
        saveWord,
        removeSavedWord,
        getProgress,
        updateProgress,
        getTimeFromStorage, // Expose the getTimeFromStorage function
        lastSignificantChange,
      }}
    >
      {children}
    </UserDataContext.Provider>
  );
};

export const useUserData = (): UserDataContextProps => {
  return useContext(UserDataContext);
};
