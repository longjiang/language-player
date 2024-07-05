// @/app/index.tsx
import React, { useMemo, useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
} from "react-native";
import Icon from "react-native-vector-icons/MaterialIcons";
import { ThemedButton } from "@/components/ThemedButton";
import { ThemedScreen } from "@/components/ThemedScreen";
import { ThemedText } from "@/components/ThemedText";
import { router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useUserData } from '@/contexts/UserDataContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { indexScreenStyles as styles } from '@/src/styles';

const IndexScreen = () => {
  const { isAuthenticated } = useAuth();
  const { userData } = useUserData();
  const { settings } = useSettings();
  const { i18n, l2Lang } = useLanguage();
  const [shouldShowHome, setShouldShowHome] = useState(false);

  useEffect(() => {
    if (isAuthenticated && userData && settings.l1LangCode && settings.l2LangCode) {
      // Redirect to media tab
      router.replace('/(tabs)/(media)');
    } else {
      // Show home screen if conditions are not met
      setShouldShowHome(true);
    }
  }, [isAuthenticated, userData, settings.l1LangCode, settings.l2LangCode]);

  const buttonText = useMemo(() => {
    if (!isAuthenticated) {
      return "title.start_learning";
    } else if (!settings.l1LangCode || !settings.l2LangCode) {
      return "Choose Language";
    } else {
      return `Continue Learning ${l2Lang?.name || ''}`;
    }
  }, [isAuthenticated, settings.l1LangCode, settings.l2LangCode, l2Lang]);

  const handleStartPress = () => {
    if (!isAuthenticated) {
      router.push("/login");
    } else if (!settings.l1LangCode || !settings.l2LangCode) {
      router.push("/select-l2");
    } else {
      router.push("/(tabs)/(media)");
    }
  };

  if (!shouldShowHome) {
    // Return null or a loading indicator while checking conditions
    return null;
  }

  return (
    <ThemedScreen
      title="msg.enrich_your_language_learning_journey"
      imageName={require("../assets/images/splash-image.png")}
      imageStyle={{ marginTop: -30}}
    >
      <View>
        <ThemedText style={styles.description}>{i18n.t('msg.discover_the_power_of_comprehensible_input')}</ThemedText>
        <ThemedButton
          title={buttonText}
          trailingIcon={<Icon name="chevron-right" />}
          onPress={handleStartPress}
        />
      </View>
    </ThemedScreen>
  );
};

export default IndexScreen;