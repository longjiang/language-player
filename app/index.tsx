// @/app/index.tsx

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useLanguage } from '@/contexts/LanguageContext';

const IndexScreen = () => {
  const { t } = useLanguage();

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.contentContainer}>
        <View style={styles.bottomContent}>
          <Text style={styles.title}>{t('msg.enrich_your_language_learning_journey')}</Text>
          <Text style={styles.blurb}>
            {t('msg.discover_the_power_of_comprehensible_input')}
          </Text>
          <TouchableOpacity style={styles.button}>
            <Text style={styles.buttonText}>{t('btn.start_learning')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    justifyContent: 'flex-end',
  },
  contentContainer: {
    flex: 0,
  },
  bottomContent: {
    paddingHorizontal: 26,
    paddingBottom: Platform.OS === 'ios' ? 20 : 26,
    paddingTop: 20,
    backgroundColor: 'white',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  blurb: {
    fontSize: 16,
    marginBottom: 20,
  },
  button: {
    backgroundColor: '#007AFF',
    paddingVertical: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});

const WrappedIndexScreen = () => (
  <SafeAreaProvider>
    <IndexScreen />
  </SafeAreaProvider>
);

export default IndexScreen;