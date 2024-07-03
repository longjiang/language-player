// @/contexts/UserDataContext.tsx
import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getUserData, updateUserData } from '@/src/api/directus/user-data'; // Make sure this path is correct

const UserDataContext = createContext();

export const UserDataProvider = ({ children }) => {
  const { getStoredAuthToken } = useAuth();
  const [userData, setUserData] = useState(null);
  const [savedWords, setSavedWords] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const authToken = await getStoredAuthToken();
        const data = await getUserData(authToken);
        setUserData(data);
        setSavedWords(data?.saved_words || null); // Save words for all languages
      } catch (error) {
        console.error('Error fetching user data:', error);
      }
    };

    fetchData();
  }, [getStoredAuthToken]);

  const removeSavedWord = async (langCode, wordId) => {
    if (!userData || !savedWords) return;

    const updatedSavedWords = {
      ...savedWords,
      [langCode]: savedWords[langCode].filter(word => word.id !== wordId)
    };

    setSavedWords(updatedSavedWords);
    try {
      const authToken = await getStoredAuthToken();
      await updateUserData(authToken, { saved_words: updatedSavedWords });
    } catch (error) {
      console.error('Error updating user data:', error);
    }
  };

  return (
    <UserDataContext.Provider value={{ userData, savedWords, removeSavedWord }}>
      {children}
    </UserDataContext.Provider>
  );
};

export const useUserData = () => {
  return useContext(UserDataContext);
};
