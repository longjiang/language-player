// @/app/index.tsx


import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Dimensions } from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '@/contexts/LanguageContext';
import ClippedImage from '@/components/ClippedImage';

const { width, height } = Dimensions.get('window');

const IndexScreen = () => {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const [bottomContentHeight, setBottomContentHeight] = useState(0);

  const imageHeight = height - bottomContentHeight - insets.top;

  return (
    <View style={styles.container}>
      <ClippedImage
        source={require("../assets/images/splash-image.png")}
        width={width}
        height={imageHeight}
        verticalAlign='bottom'
        horizontalAlign='center'
        resizeMode='cover'
        aspectRatio={0.5937}
      />
      <SafeAreaView style={styles.contentContainer}>
        <View 
          style={styles.bottomContent}
          onLayout={(event) => {
            const { height } = event.nativeEvent.layout;
            setBottomContentHeight(height);
          }}
        >
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
  },
  contentContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
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

export default WrappedIndexScreen;