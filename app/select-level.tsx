// @/app/select-level.tsx

import React from "react";
import { StyleSheet, View } from "react-native";
import { ThemedScreen } from "@/components/ThemedScreen";
import { router } from "expo-router";
import { useLanguage } from "@/contexts/LanguageContext";
import { ThemedText } from "@/components/ThemedText";
import LevelButton from "@/components/LevelButton";
import { useUserData } from "@/contexts/UserDataContext";

const SelectLevelScreen = () => {
  const { l2Lang } = useLanguage();
  const { userData, updateProgress } = useUserData();

  if (!l2Lang) return null;

  const levels = [1, 2, 3, 4, 5, 6, 7];

  const onSelect = async (level: number) => {
    try {
      await updateProgress(l2Lang.code, { level: String(level), time: 0 });
      router.navigate("/(tabs)/(media)");
    } catch (error) {
      console.error('Error updating progress:', error);
    }
  };

  return (
    <ThemedScreen
      title={`What's your current ${l2Lang.name} level?`}
      onBackPress={() => router.navigate("/select-l1")}
    >
      <View>
        {levels.map(level => (
          <LevelButton
            key={level}
            level={level}
            onPress={() => onSelect(level)}
            style={styles.item}
            size="large"
          />
        ))}
      </View>
      <ThemedText style={{ marginTop: 20, textAlign: "center" }}>
        “HSK” is the official Chinese proficiency test, with Level 1 being the lowest and Level 9 being the highest.
      </ThemedText>
    </ThemedScreen>
  );
};

const styles = StyleSheet.create({
  item: {
    paddingVertical: 4,
    paddingHorizontal: 16,
    borderRadius: 10,
  }
});

export default SelectLevelScreen;
