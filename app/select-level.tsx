// @/app/select-level.tsx

import React from "react";
import { StyleSheet, View } from "react-native";
import { ThemedScreen } from "@/components/ThemedScreen";
import { router } from "expo-router";
import { useLanguage } from "@/contexts/LanguageContext";
import { ThemedText } from "@/components/ThemedText";
import LevelButton from "@/components/LevelButton";

const SelectLevelScreen = () => {
  const { l2Lang } = useLanguage();

  if (!l2Lang) return null;

  const levels = Array.from({ length: 9 }, (_, i) => i + 1); // Assuming 9 levels

  const onSelect = (level: number) => {
    router.navigate("/(tabs)/(media)");
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
            onPress={onSelect}
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
