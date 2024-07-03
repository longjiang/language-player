import React from "react";
import { StyleSheet, View } from "react-native";
import { ThemedScreen } from "@/components/ThemedScreen";
import { router } from "expo-router";
import { useLanguage } from "@/contexts/LanguageContext";
import { languageLevelsByL2Code } from '@/src/language-levels';
import { ThemedText } from "@/components/ThemedText";
import LevelButton from "@/components/LevelButton";

const SelectLevelScreen = () => {
  const { l2Lang } = useLanguage();

  if (!l2Lang) return null;

  const levels = languageLevelsByL2Code(l2Lang.code);

  const onSelect = (level: number) => {
    router.navigate("/(tabs)/(media)");
  };

  return (
    <ThemedScreen
      title={`What's your current ${l2Lang.name} level?`}
      onBackPress={() => router.navigate("/select-l1")}
    >
      <View>
        {Object.values(levels).map(({ level, levelName, examLevelName }) => (
          <LevelButton
            key={level}
            level={level}
            levelName={levelName}
            examLevelName={examLevelName}
            onPress={onSelect}
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
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
  }
});

export default SelectLevelScreen;
