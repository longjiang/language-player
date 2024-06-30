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
import { languageLevelsByL2Code } from '@/src/language-levels';
import { useLanguage } from "@/contexts/LanguageContext";


const SelectLevelScreen = () => {

  const { l2Lang } = useLanguage();

  if (!l2Lang) return;;

  const levels = languageLevelsByL2Code(l2Lang.code);

  const onSelect = (level: number) => {
    router.navigate("/(tabs)/(media)");
  };
  
  const colorScheme = useColorScheme();

  return (
    <ThemedScreen
      title={`What's your current ${l2Lang.name} level?`}
      onBackPress={() => router.navigate("/select-l1")}
    >
      <View>
        {Object.values(levels).map(({ level, levelName, examLevelName }) => 
          {
            const levelColor = LevelColors[colorScheme || 'light'][level]
            return <ThemedButton
              key={level}
              title={`${levelName} (${examLevelName})`}
              leadingIcon={<Icon name="circle" style={{ color: levelColor || 'rgba(0,0,0,0)' }} />}
              trailingIcon={<Icon name="chevron-right" />}
              onPress={() => onSelect(level)}
              type="accent"
              size="small"
              style={styles.item}
            />
          }
        )}
      </View>
      <ThemedText style={{ marginTop: 20, textAlign: "center" }}  >
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
