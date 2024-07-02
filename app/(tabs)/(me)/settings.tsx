// @/app/(tabs)/(me)/settings.tsx

import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { ThemedScreen, ThemedText, ThemedSwitch } from '@/components';
import { useThemeColor } from '@/hooks/useThemeColor';
import { router } from 'expo-router';
import { useSettings } from '@/contexts/SettingsContext';  // Import useSettings hook

const SettingsScreen = () => {
  const { settings, dispatch } = useSettings();  // Use settings from context
  const secondaryBrandColor = useThemeColor({}, 'secondaryBrand');

  const toggleSetting = async (settingKey) => {
    dispatch({ type: 'TOGGLE_SETTING', payload: settingKey });  // Update state using context
    // Optionally persist changes here or handle it globally in the context provider
  };

  const renderSwitch = (label, settingKey) => (
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
        {renderSwitch('Show Definition', 'showDefinition')}
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

const styles = StyleSheet.create({
  container: {
    paddingTop: 20,
    height: '100%',
  },
  switchContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 10,
  },
  subtitle: {
    marginBottom: 10,
  }
});

export default SettingsScreen;
