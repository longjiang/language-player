// @/contexts/UserDataContext.tsx
import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getUserData, patchUserData } from '@/src/api/directus/user-data'; // Make sure this path is correct

const UserDataContext = createContext();

export const UserDataProvider = ({ children }) => {
  const { getStoredAuthToken } = useAuth();
  const [userData, setUserData] = useState(null);
  const [savedWords, setSavedWords] = useState({}); // Initialize as an empty object

  useEffect(() => {
    const fetchData = async () => {
      try {
        const authToken = await getStoredAuthToken();
        const data = await getUserData(authToken);
        setUserData(data);
        setSavedWords(data?.saved_words || {}); // Ensure saved words are an object
      } catch (error) {
        console.error('Error fetching user data:', error);
      }
    };

    fetchData();
  }, [getStoredAuthToken]);

  const hasSavedWord = (langCode, wordId) => {
    return savedWords[langCode]?.some(word => word.id === wordId);
  };

  const saveWord = async (langCode, wordId) => {
    if (!userData || !savedWords) return;

    const updatedSavedWords = {
      ...savedWords,
      [langCode]: [...(savedWords[langCode] || []), { id: wordId }]
    };

    setSavedWords(updatedSavedWords);
    try {
      const authToken = await getStoredAuthToken();
      await patchUserData(userData.id, { saved_words: JSON.stringify(updatedSavedWords) }, authToken);
    } catch (error) {
      console.error('Error updating user data:', error);
    }
  };

  const removeSavedWord = async (langCode, wordId) => {
    if (!userData || !savedWords) return;

    const updatedSavedWords = {
      ...savedWords,
      [langCode]: savedWords[langCode].filter(word => word.id !== wordId)
    };

    setSavedWords(updatedSavedWords);
    try {
      const authToken = await getStoredAuthToken();
      await patchUserData(userData.id, { saved_words: JSON.stringify(updatedSavedWords) }, authToken);
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

export const useUserData = () => {
  return useContext(UserDataContext);
};
