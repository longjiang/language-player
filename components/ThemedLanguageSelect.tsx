import React from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { ThemedText } from "@/components/ThemedText";
import { ThemedSearchableSelect, Option } from "@/components/ThemedSearchableSelect";

export const ThemedLanguageSelect: React.FC<{
  onSelect: (value: string) => void;
  placeholder?: string;
  initialValue?: Option;
}> = ({
  onSelect,
  placeholder = 'Select a language',
  initialValue
}) => {
  const options = [
    { label: 'English', value: 'en', flag: '🇬🇧' },
    { label: 'Spanish', value: 'es', flag: '🇪🇸' },
    { label: 'French', value: 'fr', flag: '🇫🇷' },
    { label: 'German', value: 'de', flag: '🇩🇪' },
    { label: 'Italian', value: 'it', flag: '🇮🇹' },
    { label: 'Portuguese', value: 'pt', flag: '🇵🇹' },
    { label: 'Dutch', value: 'nl', flag: '🇳🇱' },
    { label: 'Russian', value: 'ru', flag: '🇷🇺' },
    { label: 'Japanese', value: 'ja', flag: '🇯🇵' },
    { label: 'Chinese', value: 'zh', flag: '🇨🇳' },
  ];

  return (
    <ThemedSearchableSelect
      options={options}
      onSelect={onSelect}
      placeholder={placeholder}
      initialValue={initialValue}  // Pass initialValue to ThemedSearchableSelect
      renderItem={({ item }) => (
        <TouchableOpacity style={styles.item} onPress={() => onSelect(item.value)}>
          <ThemedText>{item.flag} {item.label}</ThemedText>
        </TouchableOpacity>
      )}
    />
  );
};

const styles = StyleSheet.create({
  item: {
    padding: 16,
  },
});
