// @/app/(tabs)/(me)/saved-words.tsx
import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { ThemedScreen } from "@/components/ThemedScreen";
import { router } from "expo-router";
import { DictionaryProvider } from "@/contexts/DictionaryContext";
import { WordList } from "@/components/WordList";
import { useUserData } from "@/contexts/UserDataContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { ThemedButton } from "@/components/ThemedButton";
import { Ionicons } from "@expo/vector-icons";

const SavedWordsScreen = () => {
  const { savedWords } = useUserData();
  const { l2Lang, t } = useLanguage();
  const [savedWordIds, setSavedWordIds] = useState(null);

  useEffect(() => {
    if (savedWords && l2Lang) {
      const savedWordsData = savedWords[l2Lang.code];
      if (savedWordsData) {
        setSavedWordIds(savedWordsData.map(word => word.id));
      }
    }
  }, [savedWords, l2Lang]);

  return (
    <ThemedScreen
      title={t('title.saved_words')}
      onBackPress={() => {
        router.navigate('/(tabs)/(me)');
      }}
    >
      <DictionaryProvider>
        <WordList wordIds={savedWordIds} />
        <View style={{ padding: 20, alignItems: 'center' }}>
          <ThemedButton
            title={t('action.clear')}
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