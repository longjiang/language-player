import React, { useState, useCallback, memo } from 'react';
import { View, TextInput, StyleSheet, TouchableOpacity, ViewStyle } from 'react-native';
import { useThemeColor } from '@/hooks/useThemeColor';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { Typography } from '@/constants/Typography';

interface ThemedInputProps {
  placeholder: string;
  size?: 'small' | 'medium';
  icon?: string;
  iconOnPress?: () => void;
  style?: ViewStyle;
  value: string;
  onChangeText: (text: string) => void;
  onSubmitEditing?: () => void;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address' | 'numeric' | 'phone-pad';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
}

export const ThemedInput: React.FC<ThemedInputProps> = memo(({
  placeholder,
  size = 'medium',
  icon,
  iconOnPress,
  style,
  value,
  onChangeText,
  onSubmitEditing,
  secureTextEntry = false,
  keyboardType = 'default',
  autoCapitalize = 'sentences',
  ...rest
}) => {
  const borderColor = useThemeColor({}, 'secondaryStroke');
  const backgroundColor = useThemeColor({}, 'secondaryBackground');
  const placeholderTextColor = useThemeColor({}, 'secondaryText');
  const containerStyles = [styles.container, size === 'small' ? styles.small : styles.medium, { borderColor, backgroundColor }, style];
  const iconSize = Typography.fontSize.medium;

  const handleChangeText = useCallback((text: string) => {
    onChangeText(text);
  }, [onChangeText]);

  return (
    <View style={containerStyles}>
      <TextInput
        style={{ flex: 1, fontSize: Typography.fontSize[size], color: useThemeColor({}, 'primaryText'), width: '100%' }}
        placeholder={placeholder}
        placeholderTextColor={placeholderTextColor}
        onSubmitEditing={onSubmitEditing}
        onChangeText={handleChangeText}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        secureTextEntry={secureTextEntry}
        {...rest}
      />
      {icon && (
        <TouchableOpacity onPress={iconOnPress} style={{ padding: size === 'small' ? 2 : 6 }}>
          <Icon name={icon} size={iconSize} color={placeholderTextColor} />
        </TouchableOpacity>
      )}
    </View>
  );
});

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
});