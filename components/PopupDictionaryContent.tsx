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
  const onExplainPress = () => {
    // Implement the logic to explain the word using AI
  }
  return (
    <View style={styles.container}>
      <ThemedText style={styles.contextText}>{context}</ThemedText>
      <ThemedText style={styles.translatedContextText}>{translatedContext}</ThemedText>
      <ThemedButton type="ghost" title="Let AI Explain" onPress={onExplainPress} />
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
  contextText: {
    fontSize: Typography.fontSize.small,
    marginVertical: 4,
  },
  translatedContextText: {
    fontSize: Typography.fontSize.small,
    marginVertical: 4,
    fontStyle: 'italic',
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
