import React, { useState } from 'react';
import { Image, StyleSheet } from 'react-native';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { ThemedButton } from '@/components/ThemedButton';
import { ThemedRadio } from '@/components/ThemedRadio';
import { ThemedInput } from '@/components/ThemedInput';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { router } from 'expo-router';

import splashImage from "../assets/images/splash-image.png";

const AcquisitionSurveyScreen = () => {
  const [selectedOption, setSelectedOption] = useState('');
  const [otherText, setOtherText] = useState('');

  const options = [
    "Word of Mouth", "Instagram", "Bilibili", "Online Ads", 
    "HSK Courses", "App Store", "Google Play", "Web Search", "YouTube", "Other"
  ];

  const handleSelectOption = (option) => {
    setSelectedOption(option);
    if (option !== 'Other') setOtherText('');
  };

  return (
    <ThemedView style={styles.container}>
      <Image source={splashImage} style={styles.image} />

      <ThemedView style={styles.contentContainer}>
        <ThemedView style={{ width: '100%', flexDirection: 'row', alignItems: 'flex-start', marginBottom: 20, marginLeft: -15 }}>
          <ThemedButton type="ghost" size="title" trailingIcon={<Icon name="chevron-left" />} onPress={() => router.navigate("/verify-email")} />
          <ThemedText type="title">How did you hear about us?</ThemedText>
        </ThemedView>
        <ThemedView>
          {options.map((option, index) => (
            <ThemedRadio
              key={index}
              label={option}
              isSelected={selectedOption === option}
              onPress={() => handleSelectOption(option)}
            />
          ))}
          {selectedOption === 'Other' && (
            <ThemedInput
              style={styles.input}
              value={otherText}
              onChangeText={setOtherText}
              placeholder="Please specify"
            />
          )}
        </ThemedView>
        <ThemedButton title="Start Learning" onPress={() => console.log('Survey results:', selectedOption, otherText)} style={{ marginTop: 20 }} />
      </ThemedView>
    </ThemedView>
  );
};

const styles = StyleSheet.create({
  image: {
    width: "100%",
    marginBottom: -290,
    position: 'relative',
    top: -300,
  },
  container: {
    flex: 1,
  },
  contentContainer: {
    flex: 1,
    padding: 26,
    textAlign: "left",
    width: "100%", // Ensure this container is full width
  },
  input: {
    marginTop: 10,
  },
});

export default AcquisitionSurveyScreen;
