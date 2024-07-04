import React, { memo, useRef, useLayoutEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Token } from './Token'; // Adjust this import path if needed
import { useDictionary } from '@/contexts/DictionaryContext';
import { useLanguage } from '@/contexts/LanguageContext';

export const TokenizedText = memo(({ text, translation, textScale, textWeight }) => {
  console.log('🍎 TokenizedText rendering:', text);

  const tokensRef = useRef([]);
  const { tokenizer } = useDictionary();
  const { l2Lang } = useLanguage();

  useLayoutEffect(() => {
    const tokenizeText = async () => {
      try {
        const result = await tokenizer.tokenize(text, l2Lang);
        tokensRef.current = result;
      } catch (error) {
        console.error('Tokenization error:', error);
        tokensRef.current = [{ text }]; // Fallback to treating the entire text as one token
      }
    };

    tokenizeText();
  }, [text, tokenizer, l2Lang]);

  return (
    <View style={styles.container}>
      {tokensRef.current.map((token, index) => (
        <Token 
          key={index} 
          token={token} 
          l2Lang={l2Lang} 
          textScale={textScale}
          textWeight={textWeight}
          context={text}
          translatedContext={translation}
        />
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