import React, { memo } from 'react';
import { StyleSheet } from 'react-native';
import { ThemedText } from './ThemedText';

const TokenizedText = memo(({ text }) => {
  console.log('🍎 TokenizedText rendering:', text);

  return (
    <ThemedText style={styles.text}>{text}</ThemedText>
  );
});

TokenizedText.displayName = 'TokenizedText';

const styles = StyleSheet.create({
  text: {
    fontSize: 16,
  },
});

export { TokenizedText };