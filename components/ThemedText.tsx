import React from 'react';
import { Text, type TextProps, StyleSheet } from 'react-native';
import { useFonts, Nunito_400Regular, Nunito_700Bold } from '@expo-google-fonts/nunito';

import { useThemeColor } from '@/hooks/useThemeColor';
import { Typography } from '@/constants/Typography';

export type ThemedTextProps = TextProps & {
  lightColor?: string;
  darkColor?: string;
  type?: 'default' | 'title' | 'defaultBold' | 'subtitle' | 'link';
};

export function ThemedText({
  style,
  lightColor,
  darkColor,
  type = 'default',
  ...rest
}: ThemedTextProps) {
  useFonts({
    Nunito_400Regular,
    Nunito_700Bold,
  });

  const primaryTextColor = useThemeColor({ light: lightColor, dark: darkColor }, 'primaryText');
  const primaryLinkColor = useThemeColor({}, 'primaryLink');

  return (
    <Text
      style={[
        { color: type === 'link' ? primaryLinkColor : primaryTextColor },
        styles[type] || styles.default,
        style,
      ]}
      {...rest}
    />
  );
}

// Design system: use fonts of the following sizes: 12, 16, 20, 26, 32, 42, 51, 67

const fontFamilyRegular = 'Nunito_400Regular';
const fontFamilyBold = 'Nunito_700Bold';


const styles = StyleSheet.create({
  default: {
    fontFamily: fontFamilyRegular,
    fontSize: Typography.fontSize.small,
    lineHeight: Typography.fontSize.small * 1.33,
  },
  defaultBold: {
    fontFamily: fontFamilyBold,
    fontSize: Typography.fontSize.small,
    lineHeight:  Typography.fontSize.small * 1.33,
  },
  subtitle: {
    fontFamily: fontFamilyBold,
    fontSize: Typography.fontSize.medium,
    lineHeight: Typography.fontSize.medium * 1.33,
  },
  title: {
    fontFamily: fontFamilyBold,
    fontSize: Typography.fontSize.large,
    lineHeight: Typography.fontSize.large * 1.33,
  },
  link: {
    fontFamily: fontFamilyRegular,
    fontSize: Typography.fontSize.small,
    lineHeight: Typography.fontSize.small * 1.33,
  },
});
