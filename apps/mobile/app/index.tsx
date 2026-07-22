import React, { useState, useEffect, useMemo } from 'react';
import { View, StyleSheet, Platform, Dimensions } from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '@/contexts/LanguageContext';
import { useT } from '@/hooks/use-t';
import { ClippedImage } from '@/components/ClippedImage';
import { useThemeColor } from '@/hooks';
import { ThemedText, ThemedButton } from '@/components';
import Icon from "react-native-vector-icons/MaterialIcons";
import { router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { TestLinks } from '@/components/TestLinks';

const { width, height } = Dimensions.get('window');

const IndexScreen = () => {
  const t = useT();
  const { l2Lang } = useLanguage();
  const insets = useSafeAreaInsets();
  const [bottomContentHeight, setBottomContentHeight] = useState(0);
  const primaryBackgroundColor = useThemeColor({}, 'primaryBackground');
  const { isAuthenticated } = useAuth();
  const { settings } = useSettings();

  const imageHeight = height - bottomContentHeight - insets.top;

  const buttonText = useMemo(() => {
    if (!isAuthenticated) {
      return t("title.start_learning");
    } else if (!settings.l1LangCode || !settings.l2LangCode) {
      return t("title.choose_language");
    } else {
      return t('title.continue_learning', { l2Code: t('lang.' + l2Lang?.code) || '' });
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
    <View style={{...styles.container, backgroundColor: primaryBackgroundColor}}>
      <ClippedImage
        source={require("../assets/images/splash-image.png")}
        width={width}
        height={imageHeight}
        verticalAlign='bottom'
        horizontalAlign='center'
        resizeMode='cover'
        aspectRatio={0.59371}
      />
      <SafeAreaView style={styles.contentContainer}>
        <View 
          style={styles.bottomContent}
          onLayout={(event) => {
            const { height } = event.nativeEvent.layout;
            setBottomContentHeight(height);
          }}
        >
          {/* <TestLinks /> */}
          <ThemedText type="title" style={{ marginBottom: 10 }}>{t('msg.enrich_your_language_learning_journey')}</ThemedText>
          <ThemedText style={styles.blurb}>
            {t('msg.discover_the_power_of_comprehensible_input')}
          </ThemedText>
          <ThemedButton
            title={buttonText}
            trailingIcon={<Icon name="chevron-right" />}
            onPress={handleStartPress}
          />
        </View>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  bottomContent: {
    paddingHorizontal: 26,
    paddingBottom: Platform.OS === 'ios' ? 20 : 26,
    paddingTop: 20,
  },
  blurb: {
    marginBottom: 20,
  },
});

const WrappedIndexScreen = () => (
  <SafeAreaProvider>
    <IndexScreen />
  </SafeAreaProvider>
);

export default WrappedIndexScreen;