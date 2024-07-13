// @/app/index.tsx


import React from 'react';
import { View, Text, Image, StyleSheet, SafeAreaView, TouchableOpacity, Dimensions, Platform } from 'react-native';
import { useLanguage } from '@/contexts/LanguageContext';

const { width, height } = Dimensions.get('window');

const IndexScreen = () => {
  const { t } = useLanguage();
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Image
          source={require("../assets/images/splash-image.png")}
          style={styles.splashImage}
        />
        <View style={styles.bottomContent}>
          <Text style={styles.title}>{ t('msg.enrich_your_language_learning_journey') }</Text>
          <Text style={styles.blurb}>
            {t('msg.discover_the_power_of_comprehensible_input')}
          </Text>
          <TouchableOpacity style={styles.button}>
            <Text style={styles.buttonText}>Start Learning</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    flex: 1,
  },
  splashImage: {
    width: width,
    height: height * 0.6,
    resizeMode: 'cover',
  },
  bottomContent: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 26,
    paddingBottom: Platform.OS === 'ios' ? 0 : 26, // Account for Android's lack of bottom safe area
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
    marginBottom: Platform.OS === 'ios' ? 20 : 0, // Add some bottom margin on iOS
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});

export default IndexScreen;