import React from "react";
import { StyleSheet } from "react-native";
import { ThemedButton } from "@/components/ThemedButton";
import Icon from "react-native-vector-icons/MaterialIcons";
import { useColorScheme } from '@/hooks/useColorScheme';
import { LevelColors } from '@/constants/Colors';

interface LevelButtonProps {
  level: number;
  levelName: string;
  examLevelName: string;
  onPress: (level: number) => void;
}

const LevelButton: React.FC<LevelButtonProps> = ({ level, levelName, examLevelName, onPress }) => {
  const colorScheme = useColorScheme();
  const levelColor = LevelColors[colorScheme || 'light'][level];

  return (
    <ThemedButton
      title={`${levelName} (${examLevelName})`}
      leadingIcon={<Icon name="circle" style={{ color: levelColor || 'rgba(0,0,0,0)' }} />}
      trailingIcon={<Icon name="chevron-right" />}
      onPress={() => onPress(level)}
      type="accent"
      size="small"
      style={styles.item}
    />
  );
};

const styles = StyleSheet.create({
  item: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
  }
});

export default LevelButton;
