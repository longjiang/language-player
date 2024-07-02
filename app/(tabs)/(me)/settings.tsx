// @/app/(tabs)/(me)/settings.tsx

import React, { useReducer, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ThemedScreen, ThemedText, ThemedSwitch } from '@/components';
import { useThemeColor } from '@/hooks/useThemeColor';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';

// Initial state for settings
const initialState = {
  showPhonetics: false,
  showDefinition: false,
  useTraditional: false,
  showTranslation: false,
  autoPronounce: false,
  darkMode: false,
  showGloss: false,
  wordsAsBlanks: false,
};

// Reducer function to handle state changes
interface SettingsState {
  showPhonetics: boolean;
  showDefinition: boolean;
  useTraditional: boolean;
  showTranslation: boolean;
  autoPronounce: boolean;
  darkMode: boolean;
  showGloss: boolean;
  wordsAsBlanks: boolean;
}

type SettingsAction =
  | { type: 'SET_SETTINGS'; payload: Partial<SettingsState> }
  | { type: 'TOGGLE_SETTING'; payload: keyof SettingsState };

const settingsReducer = (state: SettingsState, action: SettingsAction): SettingsState => {
  switch (action.type) {
    case 'SET_SETTINGS':
      return { ...state, ...action.payload };
    case 'TOGGLE_SETTING':
      return { ...state, [action.payload]: !state[action.payload] };
    default:
      return state;
  }
};

const SettingsScreen = () => {
  const [settings, dispatch] = useReducer(settingsReducer, initialState);
  const secondaryBrandColor = useThemeColor({}, 'secondaryBrand');

  useEffect(() => {
    SecureStore.getItemAsync('userSettings').then(savedSettings => {
      savedSettings && dispatch({ type: 'SET_SETTINGS', payload: JSON.parse(savedSettings) });
    });
  }, []);

  const toggleSetting = async (setting: keyof SettingsState) => {
    const updatedSettings: SettingsState = { ...settings, [setting]: !settings[setting] };
    dispatch({ type: 'TOGGLE_SETTING', payload: setting });
    await SecureStore.setItemAsync('userSettings', JSON.stringify(updatedSettings));
  };

  const renderSwitch = (label: string, settingKey: keyof SettingsState): JSX.Element => (
    <View style={styles.switchContainer}>
      <ThemedText>{label}</ThemedText>
      <ThemedSwitch isEnabled={settings[settingKey]} toggleSwitch={() => toggleSetting(settingKey)} />
    </View>
  );

  return (
    <ThemedScreen title="Settings" onBackPress={() => router.back()}>
      <View style={styles.container}>
        <ThemedText type="subtitle" style={{ ...styles.subtitle, color: secondaryBrandColor }}>Language Settings</ThemedText>
        {renderSwitch('Show Phonetics', 'showPhonetics')}
        {renderSwitch('Show Definition', 'showDefinition')}
        {renderSwitch('Use Traditional', 'useTraditional')}
        {renderSwitch('Show Translation', 'showTranslation')}
        {renderSwitch('Show Gloss for Saved', 'showGloss')}
        {renderSwitch('Saved Words as Blanks', 'wordsAsBlanks')}
        {renderSwitch('Auto Pronounce', 'autoPronounce')}
        <ThemedText type="subtitle" style={{ ...styles.subtitle, marginTop: 26, color: secondaryBrandColor }}>App Settings</ThemedText>
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
