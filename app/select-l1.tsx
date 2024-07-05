// @/app/select-l1

import React, { useState, useEffect } from "react";
import { ThemedLanguageSelect } from "@/components/ThemedLanguageSelect";
import { ThemedButton } from "@/components/ThemedButton";
import { ThemedScreen } from "@/components/ThemedScreen";
import { router } from "expo-router";
import { useLanguage } from "@/contexts/LanguageContext";
import Icon from "react-native-vector-icons/MaterialIcons";
import * as Localization from "expo-localization";
import { selectL1Styles as styles } from "@/src/styles";
import { useUserData } from "@/contexts/UserDataContext";
import { ThemedText } from "@/components/ThemedText";

const SelectL1Screen = () => {
  const { l1Lang, l2Lang, setL1Lang, languages, t } = useLanguage();
  const { progress } = useUserData();
  const [defaultLanguage, setDefaultLanguage] = useState<string | null>(null);

  useEffect(() => {
    const setInitialLanguage = () => {
      if (l1Lang) {
        // If l1Lang is already set, use it
        setDefaultLanguage(l1Lang.code);
      } else {
        // Otherwise, try to use the system's language
        const systemLanguage = Localization.locale.split('-')[0]; // Get the base language code
        const language = languages?.getLangByCode(systemLanguage);
        if (language) {
          setL1Lang(language);
          setDefaultLanguage(systemLanguage);
        } else {
          // If system language is not available, default to the first available language
          const firstAvailableLanguage = languages?.getLanguages()[0];
          if (firstAvailableLanguage) {
            setL1Lang(firstAvailableLanguage);
            setDefaultLanguage(firstAvailableLanguage.code);
          }
        }
      }
    };

    if (languages) {
      setInitialLanguage();
    }
  }, [languages, l1Lang, setL1Lang]);

  const onSelect = (value: string) => {
    if (!languages) return;
    const language = languages.getLangByCode(value)
    setL1Lang(language);
  };

  const handleNextPress = () => {
    if (l2Lang && progress[l2Lang.code]?.level) {
      router.replace("/(tabs)/(media)");
    } else {
      router.navigate("/select-level");
    }
  };

  return (
    <ThemedScreen
      title='msg.what_your_first_language'
      onBackPress={() => router.navigate("/select-l2")}
      imageName={require("../assets/images/splash-image.png")}
      imageStyle={{ marginTop: -400 }}
    >
      <ThemedLanguageSelect onSelect={onSelect} initialValue={defaultLanguage} scope="l1" />

      <ThemedButton
        title={t('title.next')}
        trailingIcon={<Icon name="chevron-right" />}
        style={styles.button}
        disabled={!l1Lang}
        onPress={handleNextPress}
      />
    </ThemedScreen>
  );
};

export default SelectL1Screen;