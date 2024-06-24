import React from 'react';
import { Text, type TextProps, StyleSheet } from 'react-native';
import { useFonts, Nunito } from '@expo-google-fonts/nunito';

import { useThemeColor } from '@/hooks/useThemeColor';
import { Typography } from '@/constants/Typography';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';

export type ThemedTextProps = TextProps & {
  lightColor?: string;
  darkColor?: string;
  type?: 'small' | 'default' | 'title' | 'defaultBold' | 'subtitle' | 'link';
  variant?: 'primary' | 'secondary';
  level?: 1 | 2 | 3 | 4 | 5 | 6;
};

export function ThemedText({
  style,
  lightColor,
  darkColor,
  type = 'default',
  variant = 'primary',
  level,
  ...rest
}: ThemedTextProps) {
  useFonts({
    Nunito
  });

  const colorScheme = useColorScheme();

  const primaryTextColor = useThemeColor({ light: lightColor, dark: darkColor }, `${variant}Text`);

  const primaryLinkColor = useThemeColor({}, 'primaryLink');

  const determineFontColor = () => {
    if (level) {
      const levelColor = Colors[colorScheme].level[level]
      return levelColor || primaryTextColor;
    }

    if (type === 'link') {
      return primaryLinkColor;
    }

    return primaryTextColor;
  }

  return (
    <Text
      style={[
        { color: determineFontColor() },
        styles[type] || styles.default,
        style,
      ]}
      {...rest}
    />
  );
}

// Design system: use fonts of the following sizes: 12, 16, 20, 26, 32, 42, 51, 67

const fontFamily = 'Nunito';


const styles = StyleSheet.create({
  small: {
    fontFamily: fontFamily,
    fontSize: Typography.fontSize.xsmall,
    lineHeight: Typography.fontSize.xsmall * 1.33,
  },
  default: {
    fontFamily: fontFamily,
    fontSize: Typography.fontSize.small,
    lineHeight: Typography.fontSize.small * 1.33,
  },
  defaultBold: {
    fontFamily: fontFamily,
    fontSize: Typography.fontSize.small,
    lineHeight:  Typography.fontSize.small * 1.33,
    fontWeight: 'bold',
  },
  subtitle: {
    fontFamily: fontFamily,
    fontSize: Typography.fontSize.medium,
    lineHeight: Typography.fontSize.medium * 1.33,
  },
  title: {
    fontFamily: fontFamily,
    fontSize: Typography.fontSize.large,
    lineHeight: Typography.fontSize.large * 1.33,
    fontWeight: 'bold',
  },
  display: {
    fontFamily: fontFamily,
    fontSize: Typography.fontSize.xlarge,
    lineHeight: Typography.fontSize.xlarge * 1.33,
    fontWeight: 'bold',
  },
  link: {
    fontFamily: fontFamily,
    fontSize: Typography.fontSize.small,
    lineHeight: Typography.fontSize.small * 1.33,
  },
});
