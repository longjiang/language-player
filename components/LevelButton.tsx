import React from "react";
import { StyleSheet, ViewStyle } from "react-native";
import { ThemedButton } from "@/components/ThemedButton";
import Icon from "react-native-vector-icons/MaterialIcons";
import { useColorScheme } from '@/hooks/useColorScheme';
import { LevelColors } from '@/constants/Colors';

interface LevelButtonProps {
  level: number;
  levelName: string;
  examLevelName: string;
  onPress: (level: number) => void;
  style?: ViewStyle;
  size?: "small" | "medium" | "large";
}

const LevelButton: React.FC<LevelButtonProps> = ({ level, levelName, examLevelName, onPress, style, size = "small" }) => {
  const colorScheme = useColorScheme();
  const levelColor = LevelColors[colorScheme || 'light'][level];

  return (
    <ThemedButton
      title={`${levelName} (${examLevelName})`}
      leadingIcon={<Icon name="circle" style={{ color: levelColor || 'rgba(0,0,0,0)' }} />}
      trailingIcon={<Icon name="chevron-right" />}
      onPress={() => onPress(level)}
      type="accent"
      size={size}
      style={style}
    />
  );
};

export default LevelButton;
