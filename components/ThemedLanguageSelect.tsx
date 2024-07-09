// @/components/ThemedLanguageSelect

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
  initialValue?: string;
  onFocus?: () => void; // Add onFocus prop
  onBlur?: () => void;  // Add onBlur prop
}> = ({
  onSelect,
  placeholder = 'Select a language',
  scope = 'l2',
  initialValue,
  onFocus,  // Destructure onFocus prop
  onBlur   // Destructure onBlur prop
}) => {
  const { languages, t } = useLanguage();

  const langToOption = (lang: any): Option => {
    const country = languages?.getCountry(lang)
    return {
      value: lang.code,
      label: 'lang.' + lang.code,
      translatedLabel: t('lang.' + lang.code),
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
    .concat([
      {
        value: "zh-Hans",
        label: "lang.zh-Hans",
        translatedLabel: t('lang.zh-Hant'),
        alternateLabel: '简体中文',
        englishLabel: 'Chinese (Simplified)',
        flag: getUnicodeFlagIcon("CN"),
      },
      {
        value: "zh-Hant",
        label: "lang.zh-Hant",
        translatedLabel: t('lang.zh-Hans'),
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
      placeholder={t('placeholder.select_language')}
      initialValue={initialValue}
      onFocus={onFocus}  // Pass onFocus to ThemedSearchableSelect
      onBlur={onBlur}    // Pass onBlur to ThemedSearchableSelect
      renderItem={({ item }) => (
        <TouchableOpacity style={styles.item} onPress={() => onSelect(item.value)}>
          <ThemedText>{item.flag} {t('lang.' + item.value)}</ThemedText>
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
