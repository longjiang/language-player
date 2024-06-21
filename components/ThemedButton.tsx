import React from 'react';
import { Text, TouchableOpacity, StyleSheet, View } from 'react-native';
import { useThemeColor } from '@/hooks/useThemeColor';
import { Swatches } from '@/constants/Swatches';
import { Typography } from '@/constants/Typography';

type ButtonProps = {
  type?: 'primary' | 'neutral' | 'ghost' | 'accent';
  size?: 'title' | 'large' | 'small';
  title?: string;
  style?: any;
  onPress?: () => void;
  leadingIcon?: React.ReactNode; // Optional leading icon
  trailingIcon?: React.ReactNode; // Optional trailing icon
};


const fontSize = {
  title: Typography.fontSize.large,
  large: Typography.fontSize.medium,
  small: Typography.fontSize.small,
};

export function ThemedButton({ type = 'primary', size = 'large', title, onPress, leadingIcon, trailingIcon, style }: ButtonProps) {
  const backgroundColor = useThemeColor({}, `${type}Brand`);
  const textColor = type === 'ghost' ? useThemeColor({}, 'primaryText') : Swatches.neutral[0];
  const secondaryTextColor = useThemeColor({}, 'secondaryText')

  const buttonStyle = [
    style,
    styles.base,
    styles[size],
    styles[type],
    { backgroundColor: backgroundColor, borderColor: type === 'neutral' ? secondaryTextColor : 'transparent' },
  ];

  const textStyle = [
    styles.textBase,
    styles.text[size],
    { color: textColor }
  ];

  return (
    <TouchableOpacity style={buttonStyle} onPress={onPress}>
      <View style={styles.contentContainer}>
        {leadingIcon && <View style={styles.iconContainer}>{React.cloneElement(leadingIcon, { color: textColor, size: fontSize[size] })}</View>}
        <Text style={textStyle}>{title}</Text>
        {trailingIcon && <View style={styles.iconContainer}>{React.cloneElement(trailingIcon, { color: textColor, size: fontSize[size] })}</View>}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  base: {
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  large: {
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  small: {

  },
  ghost: {
    paddingHorizontal: 0,
  },
  textBase: {
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: 'Nunito',
  },
  text: {
    title: { fontSize: fontSize.title },
    large: { fontSize: fontSize.large },
    small: { fontSize: fontSize.small },
  },
  contentContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainer: {
    marginHorizontal: 4,
  }
});