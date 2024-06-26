// @/components/ThemedInput.tsx
import React from 'react';
import { View, TextInput, StyleSheet, TouchableOpacity, ViewStyle, TextStyle } from 'react-native';
import { useThemeColor } from '@/hooks/useThemeColor';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { Typography } from '@/constants/Typography';

// Define the type for the props of ThemedInput component
interface ThemedInputProps {
  placeholder: string;
  size?: 'small' | 'medium';
  icon?: string;
  iconOnPress?: () => void;
  style?: ViewStyle;
  value?: string;
  onChangeText?: (text: string) => void;
  onSubmitEditing?: () => void;
}

export const ThemedInput: React.FC<ThemedInputProps> = ({
  placeholder,
  size = 'medium',
  icon,
  iconOnPress,
  style,
  value,
  onChangeText,
  onSubmitEditing,
  ...rest
}) => {
  const borderColor = useThemeColor({}, 'secondaryStroke');
  const backgroundColor = useThemeColor({}, 'secondaryBackground');
  const placeholderTextColor = useThemeColor({}, 'secondaryText');
  const containerStyles = [styles.container, size === 'small' ? styles.small : styles.medium, { borderColor, backgroundColor }, style];
  const iconSize = size === 'small' ? Typography.fontSize.small : Typography.fontSize.medium;

  return (
    <View style={containerStyles}>
      <TextInput
        style={[styles.input, {color: useThemeColor({}, 'primaryText'), width: '100%'}]}
        placeholder={placeholder}
        placeholderTextColor={placeholderTextColor}
        onSubmitEditing={onSubmitEditing}
        onChangeText={onChangeText}
        {...rest}
      />
      {icon && (
        <TouchableOpacity onPress={iconOnPress} style={styles.icon}>
          <Icon name={icon} size={iconSize} color={placeholderTextColor} onPress={onSubmitEditing} />
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
  },
  medium: {
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  small: {
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  input: {
    flex: 1,
    fontSize: Typography.fontSize.small,
  },
  icon: {
    padding: 10,
  },
});
