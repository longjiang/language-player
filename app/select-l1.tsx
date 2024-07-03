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

const SelectL2Screen = () => {
  const { l1Lang, setL1Lang, languages } = useLanguage();
  const { progress } = useUserData();
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
  };

  const handleNextPress = () => {
    if (l1Lang && progress[l1Lang.code]?.level !== '1') {
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
      <ThemedLanguageSelect onSelect={onSelect} initialValue={deviceLanguage || l1Lang?.code} scope="l1" />

      <ThemedButton
        title="title.next"
        trailingIcon={<Icon name="chevron-right" />}
        style={styles.button}
        disabled={!l1Lang}
        onPress={handleNextPress}
      />
    </ThemedScreen>
  );
};

export default SelectL2Screen;
