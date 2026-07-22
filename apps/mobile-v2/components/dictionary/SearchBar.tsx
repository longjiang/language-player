import React from 'react';
import { View, TextInput, Pressable, Text, ActivityIndicator } from 'react-native';
import { useT } from '@/hooks/use-t';

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  onSubmit: () => void;
  onClear: () => void;
  loading?: boolean;
  placeholder?: string;
}

export function SearchBar({ value, onChangeText, onSubmit, onClear, loading, placeholder }: SearchBarProps) {
  const t = useT();

  return (
    <View className="flex-row items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
      <Text className="text-base text-muted-foreground">🔍</Text>
      <TextInput
        className="flex-1 text-base text-foreground"
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmit}
        placeholder={placeholder ?? t('placeholder.dictionary_search')}
        placeholderTextColor="#888"
        returnKeyType="search"
        autoCapitalize="none"
        autoCorrect={false}
      />
      {loading ? (
        <ActivityIndicator size="small" className="text-muted-foreground" />
      ) : value.length > 0 ? (
        <Pressable onPress={onClear} className="p-1">
          <Text className="text-muted-foreground">✕</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
