// @/app/select-l2.tsx
import React, { useState } from "react";
import { StyleSheet, View, ScrollView } from "react-native";
import { Option, ThemedLanguageSelect } from "@/components/ThemedLanguageSelect";
import { ThemedButton } from "@/components/ThemedButton";
import { ThemedScreen } from "@/components/ThemedScreen";
import { LanguageIcon } from "@/components/LanguageIcon"; // Make sure the import path is correct
import { router } from "expo-router";
import Icon from "react-native-vector-icons/MaterialIcons";

const SelectL2Screen = () => {
  const [selectedLanguage, setSelectedLanguage] = useState("");

  const languageOptions: Option[] = [
    { value: "zh", label: "Chinese", icon: require("@/assets/flags/china.png") },
    { value: "en", label: "English", icon: require("@/assets/flags/uk.png") },
    {
      value: "ja",
      label: "Japanese",
      icon: require("@/assets/flags/japan.png"),
    },
    { value: "fr", label: "French", icon: require("@/assets/flags/france.png") },
    { value: "ko", label: "Korean", icon: require("@/assets/flags/korea.png") },
    { value: "es", label: "Spanish", icon: require("@/assets/flags/spain.png") },
  ];

  const onSelect = (value: string) => {
    setSelectedLanguage(value);
  };

  // Function to get an option based on the value
  const getOption: (value: string) => Option | undefined = (value) => {
    return languageOptions.find((lang: Option) => lang.value === value);
  };

  return (
    <ThemedScreen
      title="What language would you like to learn?"
      onBackPress={() => router.navigate("/acquisition-survey")}
    >
      <ScrollView contentContainerStyle={styles.iconLayout}>
        {languageOptions.map((lang: Option) => (
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
        initialValue={getOption(selectedLanguage)}
        placeholder="100+ more languages"
      />

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
  // Add or adjust other styles as necessary
});

export default SelectL2Screen;
