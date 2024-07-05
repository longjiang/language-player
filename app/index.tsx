// @/app/index.tsx
import React, { useMemo } from 'react';
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

const Index = () => {
  const { isAuthenticated } = useAuth();
  const { userData } = useUserData();
  const { settings } = useSettings();
  const { l2Lang } = useLanguage();

  const buttonText = useMemo(() => {
    if (!isAuthenticated) {
      return "Start Learning";
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

  return (
    <ThemedScreen
      title="Enrich your language-learning journey"
      imageName={require("../assets/images/splash-image.png")}
      imageStyle={{ marginTop: -30}}
    >
      <View>
        <ThemedText style={styles.description}>
          Discover the power of Comprehensible Input through hundreds of
          thousands of videos in over 100 languages.
        </ThemedText>
        <ThemedButton
          title={buttonText}
          trailingIcon={<Icon name="chevron-right" />}
          onPress={handleStartPress}
        />
      </View>
    </ThemedScreen>
  );
};

const styles = StyleSheet.create({
  image: {
    width: "100%",
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 10,
  },
  description: {
    fontSize: 16,
    marginBottom: 20,
  },
});

export default Index;
