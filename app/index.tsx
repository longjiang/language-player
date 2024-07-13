import React, { useState, useEffect } from 'react';
import { View, Text, Image, StyleSheet, SafeAreaView, TouchableOpacity, Dimensions, Platform } from 'react-native';
import { useLanguage } from '@/contexts/LanguageContext';

const { width } = Dimensions.get('window');

const IndexScreen = () => {
  const { t } = useLanguage();
  const [imageAspectRatio, setImageAspectRatio] = useState(1);

  useEffect(() => {
    Image.getSize(
      Image.resolveAssetSource(require("../assets/images/splash-image.png")).uri,
      (imageWidth, imageHeight) => {
        setImageAspectRatio(imageWidth / imageHeight);
      },
      (error) => {
        console.error("Error getting image size:", error);
      }
    );
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.imageContainer}>
        <Image
          source={require("../assets/images/splash-image.png")}
          style={[
            styles.splashImage,
            { aspectRatio: imageAspectRatio }
          ]}
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
    overflow: 'hidden',
    alignItems: 'center', // Center the image horizontally
    justifyContent: 'flex-end', // Align the image to the bottom of its container
  },
  splashImage: {
    width: width, // Ensure the image is always as wide as the screen
    height: undefined, // Height will be calculated based on aspectRatio
  },
  bottomContent: {
    paddingHorizontal: 26,
    paddingBottom: Platform.OS === 'ios' ? 20 : 26,
    paddingTop: 20,
    backgroundColor: 'white', // Ensure the bottom content has a background
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