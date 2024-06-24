// @/app/select-l2.tsx
import React from "react";
import { StyleSheet } from "react-native";
import { ThemedButton } from "@/components/ThemedButton";
import { ThemedScreen } from "@/components/ThemedScreen";
import Icon from "react-native-vector-icons/MaterialIcons";
import { router } from "expo-router";
import { DictionaryProvider } from "@/contexts/DictionaryContext";
import { SavedWords } from "@/components/SavedWords";

const SavedWordsScreen = () => {
  return (
    <ThemedScreen
      title="Saved Words"
      onBackPress={() => {
        router.navigate('/(tabs)/(me)')
      }}
    >
      <DictionaryProvider>
        <SavedWords />
      </DictionaryProvider>
      
      <ThemedButton
        title="Clear"
        type="neutral"
        size="medium"
        leadingIcon={<Icon name="delete-outline" />}
        style={styles.button}
        onPress={() => {
          router.navigate("/(tabs)/(dictionary)");
        }}
      />
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
