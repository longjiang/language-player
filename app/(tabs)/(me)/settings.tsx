// @/app/settings.tsx
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ThemedScreen } from "@/components/ThemedScreen";
import { ThemedText } from "@/components/ThemedText";
import ThemedSwitch from '@/components/ThemedSwitch';
import { useThemeColor } from '@/hooks/useThemeColor';
import { router } from 'expo-router';

const SettingsScreen = () => {
  // Existing states for each switch
  const [showPhonetics, setShowPhonetics] = useState(false);
  const [showDefinition, setShowDefinition] = useState(false);
  const [useTraditional, setUseTraditional] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);
  const [autoPronounce, setAutoPronounce] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  // New states for added options
  const [showGloss, setShowGloss] = useState(false);
  const [wordsAsBlanks, setWordsAsBlanks] = useState(false);

  const secondaryBrandColor = useThemeColor({}, 'secondaryBrand'); // Retrieve accent color


  return (
    <ThemedScreen
      title="Settings"
      onBackPress={() => {router.back();}}
    >
      
      <View style={styles.container}>
        <ThemedText type="subtitle" style={{ marginBottom: 10, color: secondaryBrandColor }}>This Language Only</ThemedText>
        <View style={styles.switchContainer}>
          <ThemedText style={styles.label}>Show Phonetics</ThemedText>
          <ThemedSwitch isEnabled={showPhonetics} toggleSwitch={() => setShowPhonetics(prev => !prev)} />
        </View>
        <View style={styles.switchContainer}>
          <ThemedText style={styles.label}>Show Definition</ThemedText>
          <ThemedSwitch isEnabled={showDefinition} toggleSwitch={() => setShowDefinition(prev => !prev)} />
        </View>
        <View style={styles.switchContainer}>
          <ThemedText style={styles.label}>Use Traditional</ThemedText>
          <ThemedSwitch isEnabled={useTraditional} toggleSwitch={() => setUseTraditional(prev => !prev)} />
        </View>
        <View style={styles.switchContainer}>
          <ThemedText style={styles.label}>Show Translation</ThemedText>
          <ThemedSwitch isEnabled={showTranslation} toggleSwitch={() => setShowTranslation(prev => !prev)} />
        </View>
        <View style={styles.switchContainer}>
          <ThemedText style={styles.label}>Show Gloss for Saved</ThemedText>
          <ThemedSwitch isEnabled={showGloss} toggleSwitch={() => setShowGloss(prev => !prev)} />
        </View>
        <View style={styles.switchContainer}>
          <ThemedText style={styles.label}>Saved Words as Blanks</ThemedText>
          <ThemedSwitch isEnabled={wordsAsBlanks} toggleSwitch={() => setWordsAsBlanks(prev => !prev)} />
        </View>
        <View style={styles.switchContainer}>
          <ThemedText style={styles.label}>Auto Pronounce</ThemedText>
          <ThemedSwitch isEnabled={autoPronounce} toggleSwitch={() => setAutoPronounce(prev => !prev)} />
        </View>
        <ThemedText type="subtitle" style={{ marginTop: 26, marginBottom: 10, color: secondaryBrandColor }}>System Wide</ThemedText>
        <View style={styles.switchContainer}>
          <ThemedText style={styles.label}>Dark Mode</ThemedText>
          <ThemedSwitch isEnabled={darkMode} toggleSwitch={() => setDarkMode(prev => !prev)} />
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

  },
});

export default SettingsScreen;