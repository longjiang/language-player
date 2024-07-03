// @/app/(tabs)/(me)/saved-words.tsx
import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { ThemedScreen } from "@/components/ThemedScreen";
import { router } from "expo-router";
import { DictionaryProvider, useDictionary } from "@/contexts/DictionaryContext";
import { WordList } from "@/components/WordList";
import { useUserData } from "@/contexts/UserDataContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { ThemedButton } from "@/components/ThemedButton";
import { Ionicons } from "@expo/vector-icons";

const SavedWordsScreen = () => {
  const { userData } = useUserData();
  const { dictionary } = useDictionary();
  const { l2Lang } = useLanguage();
  const [savedWords, setSavedWords] = useState(null);

  useEffect(() => {
    const fetchWords = async () => {
      if (userData) {
        const savedWordsData = userData?.saved_words[l2Lang.code];
        if (!savedWordsData) return;
        const words = await Promise.all(savedWordsData.map(async (word) => await dictionary.getEntry(word.id)));
        setSavedWords(words);
      }
    };

    fetchWords();
  }, [userData, l2Lang, dictionary]);

  return (
    <ThemedScreen
      title="Saved Words"
      onBackPress={() => {
        router.navigate('/(tabs)/(me)');
      }}
    >
      <DictionaryProvider>
        <WordList words={savedWords} />
        <View style={{ padding: 20, alignItems: 'center' }}>
          <ThemedButton
            title="Clear"
            type="neutral"
            size="medium"
            leadingIcon={<Ionicons name="trash-outline" />}
            onPress={() => {
              router.navigate("/(tabs)/(dictionary)");
            }}
          />
        </View>
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
