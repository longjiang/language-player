import React from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { ThemedText } from "@/components/ThemedText";
import { ThemedSearchableSelect, Option } from "@/components/ThemedSearchableSelect";
export { Option } from "@/components/ThemedSearchableSelect";
import { useLanguage } from "@/contexts/LanguageContext";
import getUnicodeFlagIcon from 'country-flag-icons/unicode'


export const ThemedLanguageSelect: React.FC<{
  onSelect: (value: string) => void;
  placeholder?: string;
  initialValue?: Option;
}> = ({
  onSelect,
  placeholder = 'Select a language',
  initialValue
}) => {
  const { languages } = useLanguage();


  const options: Option[] = languages
    ?.getLanguages()
    .map((lang: any) => {
      const country = languages?.getCountry(lang)
      return {
        value: lang.iso639_1 || lang.iso639_3,
        label: lang.name,
        flag: country ? getUnicodeFlagIcon(country.alpha2Code) : '',
      };
    }).sort((a, b) => a.label.localeCompare(b.label)) || [];

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
