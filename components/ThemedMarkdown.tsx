// @/components/ThemedMarkdown.tsx

import React from 'react';
import { StyleSheet, type ViewStyle, type TextStyle } from 'react-native';
import Markdown, { MarkdownProps } from 'react-native-markdown-display';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useFonts, Nunito_400Regular, Nunito_800ExtraBold } from '@expo-google-fonts/nunito';
import { useColorScheme } from '@/hooks/useColorScheme';
import { LevelColors } from '@/constants/Colors';
import { Typography } from '@/constants/Typography';

export type ThemedMarkdownProps = MarkdownProps & {
  lightColor?: string;
  darkColor?: string;
  variant?: 'primary' | 'secondary';
  level?: 1 | 2 | 3 | 4 | 5 | 6 | 7;
};

export function ThemedMarkdown({
  style,
  lightColor,
  darkColor,
  variant = 'primary',
  level,
  ...rest
}: ThemedMarkdownProps) {
  
  useFonts({
    Nunito_400Regular, Nunito_800ExtraBold
  });

  const colorScheme = useColorScheme();
  const primaryTextColor = useThemeColor({ light: lightColor, dark: darkColor }, `${variant}Text`);
  const primaryLinkColor = useThemeColor({}, 'primaryLink');

  const determineFontColor = () => {
    if (level) {
      const levelColor = LevelColors[colorScheme || 'light'][level];
      return levelColor || primaryTextColor;
    }
    return primaryTextColor;
  };

  const markdownStyles = StyleSheet.create({
    body: {
      color: determineFontColor(),
      fontFamily: 'Nunito_400Regular',
      fontSize: Typography.fontSize.small,
    },
    heading1: {
      color: determineFontColor(),
      fontFamily: 'Nunito_800ExtraBold',
      fontSize: Typography.fontSize.xxlarge,
    },
    heading2: {
      color: determineFontColor(),
      fontFamily: 'Nunito_800ExtraBold',
      fontSize: Typography.fontSize.xlarge,
    },
    heading3: {
      color: determineFontColor(),
      fontFamily: 'Nunito_800ExtraBold',
      fontSize: Typography.fontSize.large,
    },
    heading4: {
      color: determineFontColor(),
      fontFamily: 'Nunito_800ExtraBold',
      fontSize: Typography.fontSize.medium,
    },
    heading5: {
      color: determineFontColor(),
      fontFamily: 'Nunito_800ExtraBold',
      fontSize: Typography.fontSize.small,
    },
    heading6: {
      color: determineFontColor(),
      fontFamily: 'Nunito_800ExtraBold',
      fontSize: Typography.fontSize.xsmall,
    },
    link: {
      color: primaryLinkColor,
      fontFamily: 'Nunito_400Regular',
      fontSize: Typography.fontSize.small,
    },
    text: {
      color: determineFontColor(),
      fontFamily: 'Nunito_400Regular',
      fontSize: Typography.fontSize.small,
    },
  });

  return (
    <Markdown style={{ body: markdownStyles.body, heading1: markdownStyles.heading1, heading2: markdownStyles.heading2, heading3: markdownStyles.heading3, heading4: markdownStyles.heading4, heading5: markdownStyles.heading5, heading6: markdownStyles.heading6, link: markdownStyles.link, text: markdownStyles.text }} {...rest} />
  );
}
