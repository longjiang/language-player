import React, { memo, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Token } from './Token';

export const TokenizedText = memo(({ text }) => {
  console.log('🍎 TokenizedText rendering:', text);

  const tokens = useMemo(() => {
    return text.split(' ').map(word => ({ text: word }));
  }, [text]);

  return (
    <View style={styles.container}>
      {tokens.map((token, index) => (
        <Token key={index} token={token} />
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