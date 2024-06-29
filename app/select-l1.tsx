// @/app/select-l1.tsx
import React, { useState } from "react";
import { StyleSheet } from "react-native";
import { ThemedLanguageSelect } from "@/components/ThemedLanguageSelect";
import { ThemedButton } from "@/components/ThemedButton";
import { ThemedScreen } from "@/components/ThemedScreen";
import { router } from "expo-router";
import { useLanguage } from "@/contexts/LanguageContext";
import Icon from "react-native-vector-icons/MaterialIcons";
import { ThemedText } from "@/components";
import { SUPPORTED_L1S } from "@/constants/LanguageConstants";

const SelectL2Screen = () => {
  const { l1Lang, setL1Lang, languages } = useLanguage();

  const onSelect = (value: string) => {
    if (!languages) return;
    setL1Lang(languages.getLangByCode(value));
  }

  return (
    <ThemedScreen
      title="What’s your first language?"
      onBackPress={() => router.navigate("/select-l2")}
      imageName={require("../assets/images/splash-image.png")}
      imageStyle={{ marginTop: -400 }}
    >
      {/* <ThemedText>{l1Lang?.name}</ThemedText> */}
      <ThemedLanguageSelect onSelect={onSelect} initialValue={l1Lang?.code} scope="l1" />

      <ThemedButton
        title="Next"
        trailingIcon={<Icon name="chevron-right" />}
        style={styles.button}
        onPress={() => {
          router.navigate("/select-level");
        }}
      />
    </ThemedScreen>
  );
};

const styles = StyleSheet.create({
  item: {
    padding: 16,
  },
  image: {
    width: "100%",
    marginBottom: 20,
    position: "relative",
    top: -230,
  },
  instructions: {
    marginBottom: 20,
  },
  button: {
    marginTop: 20,
    marginBottom: 110,
  },
  // Add or adjust other styles as necessary
});

export default SelectL2Screen;
