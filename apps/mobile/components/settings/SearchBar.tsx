import React from 'react';
import { View, TextInput } from 'react-native';
import { Search, X } from 'lucide-react-native';
import { ICON_MUTED, PLACEHOLDER_COLOR } from '@/lib/theme-colors';

type SearchBarProps = {
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
};

export function SearchBar({ value, onChangeText, placeholder }: SearchBarProps) {
  return (
    <View className="flex-row items-center rounded-lg border border-border bg-muted px-3 py-2">
      <Search size={16} color={ICON_MUTED} />
      <TextInput
        className="flex-1 text-sm text-foreground ml-2"
        placeholder={placeholder}
        placeholderTextColor={PLACEHOLDER_COLOR}
        value={value}
        onChangeText={onChangeText}
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
      />
      {value.length > 0 ? (
        <X
          size={16}
          color={ICON_MUTED}
          onPress={() => onChangeText('')}
        />
      ) : null}
    </View>
  );
}
