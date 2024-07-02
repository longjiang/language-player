// @/app/(tabs)/(me)/settings.tsx

import React, { useEffect } from 'react';
import { View } from 'react-native';
import { ThemedScreen, ThemedText, ThemedSwitch } from '@/components';
import { useThemeColor } from '@/hooks/useThemeColor';
import { router } from 'expo-router';
import { useSettings } from '@/contexts/SettingsContext';  // Import useSettings hook
import { settingsStyles as styles } from '@/src/styles';
import { SettingsState } from '@/contexts/SettingsContext';

const SettingsScreen = () => {
  const { settings, dispatch } = useSettings();  // Use settings from context
  const secondaryBrandColor = useThemeColor({}, 'secondaryBrand');

  const toggleSetting = async (settingKey: any) => {
    dispatch({ type: 'TOGGLE_SETTING', payload: settingKey });  // Update state using context
  };

  const renderSwitch = (label: string, settingKey: keyof SettingsState) => (
    <View style={styles.switchContainer}>
      <ThemedText>{label}</ThemedText>
      <ThemedSwitch isEnabled={settings[settingKey]} toggleSwitch={() => toggleSetting(settingKey)} />
    </View>
  );

  return (
    <ThemedScreen title="Settings" onBackPress={() => router.back()}>
      <View style={styles.container}>
        <ThemedText type="subtitle" style={{ ...styles.subtitle, color: secondaryBrandColor }}>
          Language Settings
        </ThemedText>
        {renderSwitch('Show Phonetics', 'showPinyin')}
        {renderSwitch('Use Traditional', 'useTraditional')}
        {renderSwitch('Show Translation', 'showTranslation')}
        {renderSwitch('Show Gloss for Saved', 'showQuickGloss')}
        {renderSwitch('Saved Words as Blanks', 'quizMode')}
        {renderSwitch('Auto Pronounce', 'autoPronounce')}
        <ThemedText type="subtitle" style={{ ...styles.subtitle, marginTop: 26, color: secondaryBrandColor }}>
          App Settings
        </ThemedText>
        {renderSwitch('Dark Mode', 'darkMode')}
      </View>
    </ThemedScreen>
  );
};

export default SettingsScreen;
