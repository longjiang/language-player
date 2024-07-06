// @/components/TokenizedText.tsx

import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Token } from './Token';
import { useDictionary } from '@/contexts/DictionaryContext';
import { useLanguage } from '@/contexts/LanguageContext';

export const TokenizedText: React.FC<TokenizedTextProps> = React.memo(({ 
  text, 
  translation, 
  textScale = 1, 
  textWeight, 
  align = 'left' 
}) => {
  const [tokens, setTokens] = useState<Array<{ text: string }>>([]);
  const { tokenizer } = useDictionary();
  const { l2Lang } = useLanguage();
  

  useEffect(() => {
    const tokenizeText = async () => {

      try {
        const result = await tokenizer.tokenize(text, l2Lang);
        setTokens(result);
      } catch (error) {
        console.error('Tokenization error:', error);
        setTokens([{ text }]);
      }
    };

    tokenizeText();
  }, [text, tokenizer, l2Lang]);

  return (
    <View style={[styles.container, { justifyContent: align }]}>
      {tokens.map((token, index) => (
        <Token 
          key={index} 
          token={token} 
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
    alignItems: 'flex-end', // This ensures all tokens align at the bottom
  },
});