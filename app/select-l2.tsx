import React, { useState, useEffect } from "react";
import { StyleSheet, View, ScrollView } from "react-native";
import { Option, ThemedLanguageSelect } from "@/components/ThemedLanguageSelect";
import { ThemedButton, ThemedScreen, LanguageIcon, ThemedText } from "@/components";
import { router } from "expo-router";
import Icon from "react-native-vector-icons/MaterialIcons";
import { useLanguage } from "@/contexts/LanguageContext";
import getUnicodeFlagIcon from 'country-flag-icons/unicode'

const SelectL2Screen = () => {
  const { l2Lang, setL2Lang, languages } = useLanguage();
  const [selectedLanguage, setSelectedLanguage] = useState(l2Lang?.iso639_1 || l2Lang?.iso639_3 || "");

  const languageCircleIcons: { [key: string]: string } = {
    zh: require("@/assets/flags/china.png"),
    en: require("@/assets/flags/uk.png"),
    ja: require("@/assets/flags/japan.png"),
    fr: require("@/assets/flags/france.png"),
    ko: require("@/assets/flags/korea.png"),
    es: require("@/assets/flags/spain.png"),
  }

  const languageOptions: Option[] = languages
    ?.getLanguages()
    .map((lang: any) => {
      const country = languages?.getCountry(lang)
      const icon = languageCircleIcons[lang.iso639_1];
      return {
        icon,
        value: lang.iso639_1 || lang.iso639_3,
        label: lang.name,
        flag: country ? getUnicodeFlagIcon(country.alpha2Code) : '',
      };
    }).sort((a, b) => a.label.localeCompare(b.label)) || [];

  const onSelect = (value: string) => {
    if (!languages) return;
    setSelectedLanguage(value);
  };

  // Function to get an option based on the value
  const getOption: (value: string) => Option | undefined = (value) => {
    return languageOptions.find((lang: Option) => lang.value === value);
  };

  // Use useEffect to set the initial selected language
  useEffect(() => {
    if (l2Lang) {
      setSelectedLanguage(l2Lang.iso639_1 || l2Lang.iso639_3);
    }
  }, [l2Lang]);

  return (
    <ThemedScreen
      title="What language would you like to learn?"
      onBackPress={() => router.back()}
    >
      <ScrollView contentContainerStyle={styles.iconLayout}>
        {languageOptions.filter(lang => lang.icon).map((lang: Option) => (
          <LanguageIcon
            key={lang.value}
            icon={lang.icon}
            label={lang.label}
            onPress={() => onSelect(lang.value)}
            selected={selectedLanguage === lang.value}
          />
        ))}
      </ScrollView>
      <ThemedLanguageSelect
        onSelect={onSelect}
        initialValue={getOption(selectedLanguage)?.value}
        placeholder={`More languages (${languageOptions.length})`}
        scope="l2"
      />

      <ThemedButton
        title="Next"
        trailingIcon={<Icon name="chevron-right" />}
        style={styles.button}
        disabled={!selectedLanguage}
        onPress={() => {
          if (!languages) return;
          const language = languages.getLangByCode(selectedLanguage)
          setL2Lang(language);
          router.navigate("/select-l1");
        }}
      />
    </ThemedScreen>
  );
};

const styles = StyleSheet.create({
  iconLayout: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-evenly",
    padding: 10,
    alignSelf: "center",
  },
  button: {
    marginTop: 20,
    marginBottom: 110,
  },
});

export default SelectL2Screen;