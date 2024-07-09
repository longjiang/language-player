// @/app/(tabs)/(me)/settings.tsx

import React from 'react';
import { View } from 'react-native';
import { ThemedScreen, ThemedText, ThemedSwitch } from '@/components';
import { useThemeColor } from '@/hooks/useThemeColor';
import { router } from 'expo-router';
import { useSettings } from '@/contexts/SettingsContext';
import { settingsStyles as styles } from '@/src/styles';
import { SettingsState } from '@/contexts/SettingsContext';
import { useLanguage } from '@/contexts/LanguageContext';

const SettingsScreen = () => {
  const { settings, dispatch } = useSettings();
  const { t, l2Lang } = useLanguage();
  const secondaryBrandColor = useThemeColor({}, 'secondaryBrand');

  const toggleSetting = async (settingKey: keyof SettingsState) => {
    dispatch({ type: 'TOGGLE_SETTING', payload: settingKey });
  };

  const renderSwitch = (label: string, settingKey: keyof SettingsState) => (
    <View style={styles.switchContainer}>
      <ThemedText>{t(label)}</ThemedText>
      <ThemedSwitch isEnabled={settings[settingKey]} toggleSwitch={() => toggleSetting(settingKey)} />
    </View>
  );

  return (
    <ThemedScreen title={t('title.settings')} onBackPress={() => router.back()}>
      <View style={styles.container}>
        <ThemedText type="subtitle" style={{ ...styles.subtitle, color: secondaryBrandColor }}>
          {t('title.language_settings')}
        </ThemedText>
        {renderSwitch('setting.show_phonetics', 'showPinyin')}
        {l2Lang.han && renderSwitch('setting.use_traditional', 'useTraditional')}
        {renderSwitch('setting.show_translation', 'showTranslation')}
        {renderSwitch('setting.show_gloss_saved', 'showQuickGloss')}
        {renderSwitch('setting.saved_words_blanks', 'quizMode')}
        {renderSwitch('setting.auto_pronounce', 'autoPronounce')}
        <ThemedText type="subtitle" style={{ ...styles.subtitle, marginTop: 26, color: secondaryBrandColor }}>
          {t('title.app_settings')}
        </ThemedText>
        {renderSwitch('setting.dark_mode', 'darkMode')}
      </View>
    </ThemedScreen>
  );
};

export default SettingsScreen;