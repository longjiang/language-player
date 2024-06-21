import React from "react";
import { StyleSheet, View } from "react-native";
import { ThemedButton } from "@/components/ThemedButton";
import { ThemedScreen } from "@/components/ThemedScreen";
import Icon from "react-native-vector-icons/MaterialIcons";
import { router } from "expo-router";
import { useThemeColor } from "@/hooks/useThemeColor";

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
  const onSelect = (level) => {
    console.log('Selected:', level);
    router.navigate("/(tabs)/(media)");
  };
  const levelColors = useThemeColor({}, 'level'); 
  console.log(levelColors);

  return (
    <ThemedScreen
      title="What's your current Chinese level?"
      onBackPress={() => router.navigate("/select-l1")}
    >
      {levels.map(({ level, label }) => (
        <ThemedButton
          key={level}
          title={label}
          leadingIcon={<Icon name="circle" style={{ color: levelColors[level] }} />}
          trailingIcon={<Icon name="chevron-right" />}
          onPress={() => onSelect(level)}
          type="accent"
          style={[styles.item]}
        />
      ))}
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
