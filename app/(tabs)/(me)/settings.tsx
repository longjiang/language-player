// @/app/settings.tsx
import React, { useReducer } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ThemedScreen } from "@/components/ThemedScreen";
import { ThemedText } from "@/components/ThemedText";
import { ThemedSwitch } from '@/components/ThemedSwitch';
import { useThemeColor } from '@/hooks/useThemeColor';
import { router } from 'expo-router';

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
const settingsReducer = (state, action) => {
  switch (action.type) {
    case 'TOGGLE_SETTING':
      return { ...state, [action.payload]: !state[action.payload] };
    default:
      return state;
  }
};

const SettingsScreen = () => {
  const [settings, dispatch] = useReducer(settingsReducer, initialState);
  const secondaryBrandColor = useThemeColor({}, 'secondaryBrand');

  const toggleSetting = (setting) => {
    dispatch({ type: 'TOGGLE_SETTING', payload: setting });
  };

  return (
    <ThemedScreen title="Settings" onBackPress={() => { router.back(); }}>
      <View style={styles.container}>
        <ThemedText type="subtitle" style={{ marginBottom: 10, color: secondaryBrandColor }}>Language Settings</ThemedText>
        <View style={styles.switchContainer}>
          <ThemedText style={styles.label}>Show Phonetics</ThemedText>
          <ThemedSwitch isEnabled={settings.showPhonetics} toggleSwitch={() => toggleSetting('showPhonetics')} />
        </View>
        <View style={styles.switchContainer}>
          <ThemedText style={styles.label}>Show Definition</ThemedText>
          <ThemedSwitch isEnabled={settings.showDefinition} toggleSwitch={() => toggleSetting('showDefinition')} />
        </View>
        <View style={styles.switchContainer}>
          <ThemedText style={styles.label}>Use Traditional</ThemedText>
          <ThemedSwitch isEnabled={settings.useTraditional} toggleSwitch={() => toggleSetting('useTraditional')} />
        </View>
        <View style={styles.switchContainer}>
          <ThemedText style={styles.label}>Show Translation</ThemedText>
          <ThemedSwitch isEnabled={settings.showTranslation} toggleSwitch={() => toggleSetting('showTranslation')} />
        </View>
        <View style={styles.switchContainer}>
          <ThemedText style={styles.label}>Show Gloss for Saved</ThemedText>
          <ThemedSwitch isEnabled={settings.showGloss} toggleSwitch={() => toggleSetting('showGloss')} />
        </View>
        <View style={styles.switchContainer}>
          <ThemedText style={styles.label}>Saved Words as Blanks</ThemedText>
          <ThemedSwitch isEnabled={settings.wordsAsBlanks} toggleSwitch={() => toggleSetting('wordsAsBlanks')} />
        </View>
        <View style={styles.switchContainer}>
          <ThemedText style={styles.label}>Auto Pronounce</ThemedText>
          <ThemedSwitch isEnabled={settings.autoPronounce} toggleSwitch={() => toggleSetting('autoPronounce')} />
        </View>
        <ThemedText type="subtitle" style={{ marginTop: 26, marginBottom: 10, color: secondaryBrandColor }}>App Settings</ThemedText>
        <View style={styles.switchContainer}>
          <ThemedText style={styles.label}>Dark Mode</ThemedText>
          <ThemedSwitch isEnabled={settings.darkMode} toggleSwitch={() => toggleSetting('darkMode')} />
        </View>
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
  label: {
    // Add any styles for labels
  },
});

export default SettingsScreen;
