// @/app/index.tsx
import React from 'react';
import { StyleSheet, View, Text, ImageBackground, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons'; // Ensure this library is properly installed
import Button from '@/components/Button';
import { ThemedView } from '@/components/ThemedView';

import splashImage from '../assets/images/splash-image.png';


const Index = () => {
  return (
    <ThemedView style={styles.container}>
      <ImageBackground source={splashImage} style={styles.backgroundImage}>
        <View style={styles.contentContainer}>
          <Text style={styles.title}>Enrich your language-learning journey</Text>
          <Text style={styles.description}>
            Discover the power of Comprehensible Input through hundreds of thousands of videos in over 100 languages.
          </Text>
          <Button title="Start Learning" trailingIcon={<Icon name="chevron-right" size={24} />} />
        </View>
      </ImageBackground>
    </ThemedView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  backgroundImage: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    resizeMode: 'cover',
  },
  contentContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: 26,
    textAlign: 'left',
    width: '100%', // Ensure this container is full width
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 10,
  },
  description: {
    fontSize: 16,
    color: 'white',
    marginBottom: 20,
  },
});

export default Index;
