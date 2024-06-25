import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { ThemedText } from './ThemedText';
import { ThemedButton } from '@/components/ThemedButton';
import { Typography } from '@/constants/Typography';
import { useDictionary } from '@/contexts/DictionaryContext';

export const PopupDictionaryContent = ({ wordData, context, translatedContext  }) => {
  const { dictionary } = useDictionary();
  // Wait for the dictionary to load
  if (!dictionary) {
    return null;
  }
  const dictionaryEntries = dictionary.findWordsInPhrase(wordData.word) || [];
  return (
    <View style={styles.container}>
      {dictionaryEntries.map((entry, index) => (
        <View key={index} style={styles.entryContainer}>
          <ThemedText style={styles.entryText}>{entry.head} - {entry.pronunciation}</ThemedText>
          {entry.definitions.map((def, idx) => (
            <ThemedText key={idx} style={styles.definitionText}>{def}</ThemedText>
          ))}
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  entryContainer: {
    marginVertical: 2,
  },
  entryText: {
    fontWeight: 'bold',
  },
  definitionText: {
    fontSize: Typography.fontSize.xsmall,
  },
});
