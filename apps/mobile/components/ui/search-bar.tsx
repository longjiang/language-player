import React from 'react';
import { View, ActivityIndicator, type TextInputProps } from 'react-native';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, X } from 'lucide-react-native';
import { ICON_MUTED, PLACEHOLDER_COLOR } from '@/lib/theme-colors';
import { useT } from '@/hooks/use-t';
import { useLanguage } from '@/contexts/LanguageContext';

/**
 * App-wide search field — the react-native-reusables default pattern: a plain
 * `Input` (its own border/background, no wrapper box) with a magnifier icon
 * beside it and an X clear button. One look for every search field in the app
 * (dictionary, settings, media, readers).
 */
export function SearchBar({
  value,
  onChangeText,
  placeholder,
  onSubmit,
  onClear,
  loading,
  inputProps,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  /** Called on submit (return key). Optional. */
  onSubmit?: () => void;
  /** Called when the ✕ clear button is pressed. Defaults to clearing `value`. */
  onClear?: () => void;
  loading?: boolean;
  /** Extra props for the underlying Input (autoFocus, testID/e2e…). */
  inputProps?: Partial<TextInputProps>;
}) {
  const t = useT();
  const { l2Lang } = useLanguage();

  return (
    <View className="flex-row items-center gap-2">
      <Search size={16} color={ICON_MUTED} />
      <Input
        className="flex-1"
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmit}
        placeholder={placeholder ?? t('placeholder.dictionary_search', { language: t(`lang.${l2Lang.code}`) })}
        placeholderTextColor={PLACEHOLDER_COLOR}
        returnKeyType="search"
        autoCapitalize="none"
        autoCorrect={false}
        {...inputProps}
      />
      {loading ? (
        <ActivityIndicator size="small" className="text-muted-foreground" />
      ) : value.length > 0 ? (
        <Button
          variant="ghost"
          size="icon"
          onPress={onClear ?? (() => onChangeText(''))}
          accessibilityLabel={t('action.clear')}
        >
          <X size={16} color={ICON_MUTED} />
        </Button>
      ) : null}
    </View>
  );
}
