// @/app/select-l1.tsx
import React, { useState, useEffect } from "react";
import { StyleSheet } from "react-native";
import { ThemedLanguageSelect } from "@/components/ThemedLanguageSelect";
import { ThemedButton } from "@/components/ThemedButton";
import { ThemedScreen } from "@/components/ThemedScreen";
import { router } from "expo-router";
import { useLanguage } from "@/contexts/LanguageContext";
import Icon from "react-native-vector-icons/MaterialIcons";
import * as Localization from "expo-localization";
import { SUPPORTED_L1S } from "@/constants/LanguageConstants";

const SelectL2Screen = () => {
  const { l1Lang, setL1Lang, languages, i18n } = useLanguage();
  const [deviceLanguage, setDeviceLanguage] = useState<string | null>(null);

  useEffect(() => {
    const defaultLanguage = Localization.locale.split('-')[0]; // Get the base language code
    const language = languages?.getLangByCode(defaultLanguage);
    if (language) {
      setL1Lang(language);
      setDeviceLanguage(defaultLanguage);
    }
  }, [languages]);

  const onSelect = (value: string) => {
    if (!languages) return;
    setL1Lang(languages.getLangByCode(value));
  }

  return (
    <ThemedScreen
      title='msg.what_your_first_language'
      onBackPress={() => router.navigate("/select-l2")}
      imageName={require("../assets/images/splash-image.png")}
      imageStyle={{ marginTop: -400 }}
    >
      <ThemedLanguageSelect onSelect={onSelect} initialValue={deviceLanguage || l1Lang?.code} scope="l1" />

      <ThemedButton
        title="title.next"
        trailingIcon={<Icon name="chevron-right" />}
        style={styles.button}
        disabled={!l1Lang}
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
