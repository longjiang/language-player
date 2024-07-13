import React from 'react';
import { View, Text, Image, StyleSheet, SafeAreaView, TouchableOpacity, Dimensions, Platform } from 'react-native';
import { useLanguage } from '@/contexts/LanguageContext';

const { width } = Dimensions.get('window');

const IndexScreen = () => {
  const { t } = useLanguage();
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.imageContainer}>
        <Image
          source={require("../assets/images/splash-image.png")}
          style={styles.splashImage}
        />
      </View>
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
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  imageContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    overflow: 'hidden',
  },
  splashImage: {
    width: width,
    height: undefined,
    aspectRatio: 0.75, // Adjust this value based on your image's aspect ratio
  },
  bottomContent: {
    paddingHorizontal: 26,
    paddingBottom: Platform.OS === 'ios' ? 20 : 26,
    paddingTop: 20,
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

export default IndexScreen;