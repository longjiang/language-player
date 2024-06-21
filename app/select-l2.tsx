// @/app/select-l2.tsx
import React, { useState } from "react";
import { StyleSheet, View, ScrollView } from "react-native";
import {ThemedLanguageSelect} from "@/components/ThemedLanguageSelect";
import {ThemedButton} from "@/components/ThemedButton";
import {ThemedScreen} from "@/components/ThemedScreen";
import {LanguageIcon} from "@/components/LanguageIcon"; // Make sure the import path is correct
import { router } from "expo-router";
import Icon from "react-native-vector-icons/MaterialIcons";

const SelectL2Screen = () => {
  const [selectedLanguage, setSelectedLanguage] = useState("");

  const languageOptions = [
    { code: 'zh', label: 'Chinese', icon: require('@/assets/flags/china.png') },
    { code: 'en', label: 'English', icon: require('@/assets/flags/uk.png') },
    { code: 'ja', label: 'Japanese', icon: require('@/assets/flags/japan.png') },
    { code: 'fr', label: 'French', icon: require('@/assets/flags/france.png') },
    { code: 'ko', label: 'Korean', icon: require('@/assets/flags/korea.png') },
    { code: 'es', label: 'Spanish', icon: require('@/assets/flags/spain.png') }
  ];

  const onSelect = (code) => {
    setSelectedLanguage(code);
  };

  return (
    <ThemedScreen
      title="What language would you like to learn?"
      onBackPress={() => router.navigate("/acquisition-survey")}
    >
      <ScrollView contentContainerStyle={styles.iconLayout}>
        {languageOptions.map(lang => (
          <LanguageIcon
            key={lang.code}
            icon={lang.icon}
            label={lang.label}
            onPress={() => onSelect(lang.code)}
            selected={selectedLanguage === lang.code}
          />
        ))}
      </ScrollView>
      <ThemedLanguageSelect onSelect={onSelect} initialValue={selectedLanguage} placeholder="100+ more languages" />

      <ThemedButton
        title="Next"
        trailingIcon={<Icon name="chevron-right" />}
        style={styles.button}
        onPress={() => {
          router.navigate("/select-l1");
        }}
      />
    </ThemedScreen>
  );
};

const styles = StyleSheet.create({
  iconLayout: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-evenly',
    padding: 10,
    alignSelf: 'center',
  },
  button: {
    marginTop: 20,
    marginBottom: 110,
  },
  // Add or adjust other styles as necessary
});

export default SelectL2Screen;
