import React from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { PLACEHOLDER_COLOR } from '@/lib/theme-colors';
import { useT } from '@/hooks/use-t';
import { useLanguage } from '@/contexts/LanguageContext';

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
  const { l2Lang } = useLanguage();

  return (
    <View className="flex-row items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
      <Text className="text-base text-muted-foreground">🔍</Text>
      <Input
        className="flex-1 text-base text-foreground border-0 bg-card px-0 py-0"
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmit}
        placeholder={placeholder ?? t('placeholder.dictionary_search', { language: t(`lang.${l2Lang.code}`) })}
        placeholderTextColor={PLACEHOLDER_COLOR}
        returnKeyType="search"
        autoCapitalize="none"
        autoCorrect={false}
      />
      {loading ? (
        <ActivityIndicator size="small" className="text-muted-foreground" />
      ) : value.length > 0 ? (
        <Button onPress={onClear} variant="ghost" size="icon">
          <Text className="text-muted-foreground">✕</Text>
        </Button>
      ) : null}
    </View>
  );
}
