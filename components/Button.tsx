import React from 'react';
import { Text, TouchableOpacity, StyleSheet, View } from 'react-native';
import { useThemeColor } from '@/hooks/useThemeColor';
import { Swatches } from '@/constants/Swatches';

type ButtonProps = {
  type: 'primary' | 'neutral' | 'ghost' | 'accent';
  size: 'large' | 'small';
  title: string;
  onPress: () => void;
  leadingIcon?: React.ReactNode; // Optional leading icon
  trailingIcon?: React.ReactNode; // Optional trailing icon
};

const Button = ({ type = 'primary', size, title, onPress, leadingIcon, trailingIcon }: ButtonProps) => {
  const backgroundColor = useThemeColor({}, `${type}Brand`);
  const textColor = type === 'ghost' ? useThemeColor({}, 'primaryText') : Swatches.neutral[0];

  const buttonStyle = [
    styles.base,
    styles[size],
    { backgroundColor: backgroundColor, borderColor: type === 'ghost' ? textColor : 'transparent' },
  ];

  const textStyle = [
    styles.textBase,
    styles.text[size],
    { color: textColor }
  ];

  return (
    <TouchableOpacity style={buttonStyle} onPress={onPress}>
      <View style={styles.contentContainer}>
        {leadingIcon && <View style={styles.iconContainer}>{React.cloneElement(leadingIcon, { color: textColor })}</View>}
        <Text style={textStyle}>{title}</Text>
        {trailingIcon && <View style={styles.iconContainer}>{React.cloneElement(trailingIcon, { color: textColor })}</View>}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  base: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 4,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    margin: 4,
  },
  large: {
    height: 50,
    minWidth: 140,
  },
  small: {
    height: 40,
    minWidth: 100,
  },
  textBase: {
    fontSize: 16,
    fontWeight: '500',
  },
  text: {
    large: { fontSize: 18 },
    small: { fontSize: 14 },
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

export default Button;