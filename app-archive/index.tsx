import React from 'react';
import { SafeAreaView, StyleSheet, View, Text, ImageBackground, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons'; // Ensure this library is properly installed

import splashImage from '../assets/images/splash-image.png';
import { Colors } from '../constants/Colors';

const Index = () => {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <ImageBackground source={splashImage} style={styles.backgroundImage}>
          <View style={styles.contentContainer}>
            <Text style={styles.title}>Enrich your language-learning journey</Text>
            <Text style={styles.description}>
              Discover the power of Comprehensible Input through hundreds of thousands of videos in over 100 languages.
            </Text>
            <TouchableOpacity style={styles.button}>
              <Text style={styles.buttonText}>Start Learning</Text>
              <Icon name="chevron-right" size={24} />
            </TouchableOpacity>
          </View>
        </ImageBackground>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: 'transparent',
  },
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
  button: {
    flexDirection: 'row',
    width: '100%',
    backgroundColor: Colors.dark.brand.primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center', // Ensures icon and text are centered
  },
  buttonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    marginRight: 10, // Space between text and icon
  }
});

export default Index;
