// @/app/(tabs)/(me)/saved-words.tsx

import React, { useEffect, useState } from "react";
import { StyleSheet } from "react-native";
import { ThemedButton } from "@/components/ThemedButton";
import { ThemedScreen } from "@/components/ThemedScreen";
import Icon from "react-native-vector-icons/MaterialIcons";
import { router } from "expo-router";
import { DictionaryProvider, useDictionary } from "@/contexts/DictionaryContext";
import { WordList } from "@/components/WordList";
import { useAuth } from "@/contexts/AuthContext";
import { getUserData } from "@/src/api/directus/user-data"; // Make sure this path is correct
import { useLanguage } from "@/contexts/LanguageContext";

const SavedWordsScreen = () => {
  const { getStoredAuthToken } = useAuth();
  
  // State to hold the fetched user data
  const [userData, setUserData] = useState(null);
  const [savedWords, setSavedWords] = useState(null);
  const { l2Lang } = useLanguage();
  const { dictionary } = useDictionary();

  // Effect to fetch user data on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        const authToken = await getStoredAuthToken();
        const data = await getUserData(authToken);
        const savedWordsData = data?.saved_words[l2Lang.code]
        if (!savedWordsData) return;
        const words = await Promise.all(savedWordsData.map(async (word) => await dictionary.getEntry(word.id)));
        if (words) {
          setSavedWords(words);
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
      }
    };

    fetchData();
  }, []); // Empty dependency array ensures this runs only once on mount

  return (
    <ThemedScreen
      title="Saved Words"
      onBackPress={() => {
        router.navigate('/(tabs)/(me)');
      }}
    >
      <DictionaryProvider>
        <WordList words={savedWords} />
      </DictionaryProvider>
    </ThemedScreen>
  );
};

const styles = StyleSheet.create({
  button: {
    marginTop: 20,
    marginBottom: 110,
  },
});

export default SavedWordsScreen;
