// @/components/LevelButton.tsx

import React from "react";
import { ViewStyle } from "react-native";
import { ThemedButton, ButtonProps } from "@/components/ThemedButton";
import Icon from "react-native-vector-icons/MaterialIcons";
import { useColorScheme } from '@/hooks/useColorScheme';
import { LevelColors } from '@/constants/Colors';
import { useLanguage } from "@/contexts/LanguageContext";
import { languageLevelsByL2Code } from '@/src/language-levels';

interface LevelButtonProps extends Omit<ButtonProps, 'onPress'> {
  level: number;
  onPress: (level: number) => void;
}

const LevelButton: React.FC<LevelButtonProps> = ({ level, onPress, style, size = "small", type = "accent" }) => {
  const colorScheme = useColorScheme();
  const { l2Lang, t } = useLanguage();

  if (!l2Lang) return null;

  const levels = languageLevelsByL2Code(l2Lang.code);

  const { levelName, examKey, examLevelName } = levels[level] || {};

  if (!levelName || !examLevelName) return null;

  const levelColor = LevelColors[colorScheme || 'light'][level];

  const title = t('level.label', { levelName: t('level.name.' + level), examLevelName: t('level.' + examKey + '.' + level) })

  return (
    <ThemedButton
      title={title}
      leadingIcon={<Icon name="circle" style={{ color: levelColor || 'rgba(0,0,0,0)' }} />}
      trailingIcon={<Icon name="chevron-right" />}
      onPress={() => onPress(level)}
      type={type}
      size={size}
      style={style}
    />
  );
};

export default LevelButton;