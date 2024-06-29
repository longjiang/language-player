import React from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { ThemedText } from "@/components/ThemedText";
import { ThemedSearchableSelect, Option } from "@/components/ThemedSearchableSelect";
export { Option } from "@/components/ThemedSearchableSelect";
import { useLanguage } from "@/contexts/LanguageContext";
import getUnicodeFlagIcon from 'country-flag-icons/unicode'
import { SUPPORTED_L1S } from "@/constants/LanguageConstants";


export const ThemedLanguageSelect: React.FC<{
  onSelect: (value: string) => void;
  placeholder?: string;
  scope: 'l1' | 'l2';
  initialValue?: string; // Change the type of initialValue prop to string
}> = ({
  onSelect,
  placeholder = 'Select a language',
  scope = 'l2',
  initialValue
}) => {
  const { languages, i18n } = useLanguage();

  const langToOption = (lang: any): Option => {
    const country = languages?.getCountry(lang)
    return {
      value: lang.code,
      label: 'lang.' + lang.code, // Will be translated in the app
      translatedLabel: i18n.t('lang.' + lang.code, { missingBehavior: "guess"}),
      alternateLabel: lang.vernacularName,
      englishLabel: lang.name,
      flag: country ? getUnicodeFlagIcon(country.alpha2Code) : '',
    };
  }

  const langs = languages?.getLanguages();
  let l2Options: Option[] = langs?.map(langToOption) || [];
  l2Options = l2Options.sort((a, b) => a.label.localeCompare(b.label));

  let l1Options = l2Options
    .filter((option) => SUPPORTED_L1S.includes(option.value))
    // Add simplified and traditional Chinese as options
    .concat([
      {
        value: "zh-Hans",
        label: "lang.zh-Hans",  // Will be translated in the app
        translatedLabel: i18n.t('lang.zh-Hant', { missingBehavior: "guess"}),
        alternateLabel: '简体中文',
        englishLabel: 'Chinese (Simplified)',
        flag: getUnicodeFlagIcon("CN"),
      },
      {
        value: "zh-Hant",
        label: "lang.zh-Hant", // Will be translated in the app
        translatedLabel: i18n.t('lang.zh-Hans', { missingBehavior: "guess"}),
        alternateLabel: '繁體中文',
        englishLabel: 'Chinese (Traditional)',
        flag: getUnicodeFlagIcon("TW"),
      },
    ]);
  l1Options = l1Options.sort((a, b) => a.label.localeCompare(b.label));

  return (
    <ThemedSearchableSelect
      options={scope === 'l1' ? l1Options : l2Options}
      onSelect={onSelect}
      placeholder={placeholder}
      initialValue={initialValue}  // Pass initialValue to ThemedSearchableSelect
      renderItem={({ item }) => (
        <TouchableOpacity style={styles.item} onPress={() => onSelect(item.value)}>
          <ThemedText>{item.flag} {i18n.t('lang.' + item.value, { missingBehavior: "guess"})}</ThemedText>
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
