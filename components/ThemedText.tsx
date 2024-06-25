// @/components/ThemedText.tsxs

import React from 'react';
import { Text, type TextProps, StyleSheet } from 'react-native';
import { useFonts, Nunito_400Regular, Nunito_800ExtraBold } from '@expo-google-fonts/nunito';

import { useThemeColor } from '@/hooks/useThemeColor';
import { Typography } from '@/constants/Typography';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';

export type ThemedTextProps = TextProps & {
  lightColor?: string;
  darkColor?: string;
  type?: 'small' | 'smallBold' | 'default' | 'defaultBold' | 'link' | 'linkBold' | 'large' | 'subtitle' | 'xlarge' | 'title' | 'xxlarge';
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
    Nunito_400Regular, Nunito_800ExtraBold
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

const fontFamilyRegular = 'Nunito_400Regular';
const fontFamilyBold = 'Nunito_800ExtraBold';


const styles = StyleSheet.create({
  small: {
    fontFamily: fontFamilyRegular,
    fontSize: Typography.fontSize.xsmall,
    lineHeight: Typography.fontSize.xsmall * 1.33,
  },
  smallBold: {
    fontFamily: fontFamilyBold,
    fontSize: Typography.fontSize.xsmall,
    lineHeight: Typography.fontSize.xsmall * 1.33,
    fontWeight: 'bold',
  },
  default: {
    fontFamily: fontFamilyRegular,
    fontSize: Typography.fontSize.small,
    lineHeight: Typography.fontSize.small * 1.33,
  },
  defaultBold: {
    fontFamily: fontFamilyBold,
    fontSize: Typography.fontSize.small,
    lineHeight: Typography.fontSize.small * 1.33,
    fontWeight: 'bold',
  },
  link: {
    fontFamily: fontFamilyRegular, // Assuming regular font for non-bold link
    fontSize: Typography.fontSize.small,
    lineHeight: Typography.fontSize.small * 1.33,
  },
  linkBold: {
    fontFamily: fontFamilyBold,
    fontSize: Typography.fontSize.small,
    lineHeight: Typography.fontSize.small * 1.33,
  },
  large: {
    fontFamily: fontFamilyRegular,
    fontSize: Typography.fontSize.medium,
    lineHeight: Typography.fontSize.medium * 1.33,
  },
  subtitle: {
    fontFamily: fontFamilyBold,
    fontSize: Typography.fontSize.medium,
    lineHeight: Typography.fontSize.medium * 1.33,
  },
  xlarge: {
    fontFamily: fontFamilyBold,
    fontSize: Typography.fontSize.large,
    lineHeight: Typography.fontSize.large * 1.33,
  },
  title: {
    fontFamily: fontFamilyBold,
    fontSize: Typography.fontSize.large,
    lineHeight: Typography.fontSize.large * 1.33,
  },
  xxlarge: {
    fontFamily: fontFamilyBold,
    fontSize: Typography.fontSize.xlarge,
    lineHeight: Typography.fontSize.xlarge * 1.33,
  },
});
