import React from 'react';
import { View, Text } from 'react-native';
import { ThemedText } from './ThemedText'; // Assuming this is already defined

export const Token = ({ token }) => {
  return (
    <View style={{ alignItems: 'center', padding: 5 }}>
      <ThemedText style={{ fontSize: 12 }}>{token.pronunciation}</ThemedText>
      <ThemedText style={{ fontSize: 16 }}>{token.word}</ThemedText>
    </View>
  );
};

export default Token;
