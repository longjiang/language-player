// @/components/ThemedInput.tsx
import React, { useState, useEffect } from 'react';
import { View, TextInput, StyleSheet, TouchableOpacity, ViewStyle, TextStyle } from 'react-native';
import { useThemeColor } from '@/hooks/useThemeColor';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { Typography } from '@/constants/Typography';
import { useLanguage } from '@/contexts/LanguageContext';

interface ThemedInputProps {
  placeholder: string;
  size?: 'small' | 'medium';
  icon?: string;
  iconOnPress?: () => void;
  style?: ViewStyle;
  initialValue?: string;  // New prop for prefilling
  onChangeText?: (text: string) => void;
  onSubmitEditing?: () => void;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address' | 'numeric' | 'phone-pad';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
}

export const ThemedInput: React.FC<ThemedInputProps> = ({
  placeholder,
  size = 'medium',
  icon,
  iconOnPress,
  style,
  initialValue = '',  // Default to empty string
  onChangeText,
  onSubmitEditing,
  secureTextEntry = false,
  keyboardType = 'default',
  autoCapitalize = 'sentences',
  ...rest
}) => {
  const [inputValue, setInputValue] = useState(initialValue);

  useEffect(() => {
    setInputValue(initialValue);
  }, [initialValue]);

  const borderColor = useThemeColor({}, 'secondaryStroke');
  const backgroundColor = useThemeColor({}, 'secondaryBackground');
  const placeholderTextColor = useThemeColor({}, 'secondaryText');
  const containerStyles = [styles.container, size === 'small' ? styles.small : styles.medium, { borderColor, backgroundColor }, style];
  const iconSize = Typography.fontSize.medium;

  const handleChangeText = (text: string) => {
    setInputValue(text);
    if (onChangeText) {
      onChangeText(text);
    }
  };

  return (
    <View style={containerStyles}>
      <TextInput
        style={{ flex: 1, fontSize: Typography.fontSize[size], color: useThemeColor({}, 'primaryText'), width: '100%' }}
        placeholder={placeholder}
        placeholderTextColor={placeholderTextColor}
        onSubmitEditing={onSubmitEditing}
        onChangeText={handleChangeText}
        value={inputValue}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        secureTextEntry={secureTextEntry}
        {...rest}
      />
      {icon && (
        <TouchableOpacity onPress={iconOnPress} style={{ padding: size === 'small' ? 2 : 6 }}>
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
});