import React from "react";
import { StyleSheet, View } from "react-native";
import { ThemedButton } from "@/components/ThemedButton";
import { ThemedScreen } from "@/components/ThemedScreen";
import Icon from "react-native-vector-icons/MaterialIcons";
import { router } from "expo-router";
import { useThemeColor } from "@/hooks/useThemeColor";
import { ThemedText } from "@/components/ThemedText";
import { LevelColors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';

const levels = [
  { level: 1, title: "HSK 1", label: "Beginner (HSK 1)" },
  { level: 2, title: "HSK 2", label: "Beginner (HSK 2)" }, 
  { level: 3, title: "HSK 3", label: "Beginner (HSK 3)" }, 
  { level: 4, title: "HSK 4", label: "Intermediate (HSK 4)" }, 
  { level: 5, title: "HSK 5", label: "Intermediate (HSK 5)" }, 
  { level: 6, title: "HSK 6", label: "Advanced (HSK 6)" },
  { level: 7, title: "HSK 7-9", label: "Advanced (HSK 7-9)" }
];


const SelectLevelScreen = () => {
  const onSelect = (level: number) => {
    router.navigate("/(tabs)/(media)");
  };
  
  const colorScheme = useColorScheme();

  return (
    <ThemedScreen
      title="What's your current Chinese level?"
      onBackPress={() => router.navigate("/select-l1")}
    >
      {levels.map(({ level, label }) => 
        {
          const levelColor = LevelColors[colorScheme || 'light'][level]
          return <ThemedButton
            key={level}
            title={label}
            leadingIcon={<Icon name="circle" style={{ color: levelColor }} />}
            trailingIcon={<Icon name="chevron-right" />}
            onPress={() => onSelect(level)}
            type="accent"
            style={[styles.item]}
          />
        }
      )}
      <ThemedText style={{ marginTop: 20, textAlign: "center" }}  >
        “HSK” is the official Chinese proficiency test, with Level 1 being the lowest and Level 9 being the highest.
      </ThemedText>
    </ThemedScreen>
  );
};

const styles = StyleSheet.create({
  item: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginVertical: 8,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  }
});

export default SelectLevelScreen;
