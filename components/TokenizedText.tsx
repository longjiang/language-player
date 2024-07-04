import React, { memo, useRef, useLayoutEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Token } from './Token'; // Adjust this import path as needed

export const TokenizedText = memo(({ text }) => {
  console.log('🍎 TokenizedText rendering:', text);

  const tokensRef = useRef([]);

  useLayoutEffect(() => {
    const tokenizeText = async () => {
      // Simulating an asynchronous operation
      await new Promise(resolve => setTimeout(resolve, 0));
      tokensRef.current = text.split(' ').map(word => ({ text: word }));
    };

    tokenizeText();
  }, [text]);

  return (
    <View style={styles.container}>
      {text.split(' ').map((word, index) => (
        <Token key={index} token={{ text: word }} />
      ))}
    </View>
  );
});

TokenizedText.displayName = 'TokenizedText';

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
});