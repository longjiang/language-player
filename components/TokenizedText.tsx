import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Token } from './Token'; // Adjust this import path if needed
import { useDictionary } from '@/contexts/DictionaryContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { ThemedText } from './ThemedText';

interface TokenizedTextProps {
  text: string;
  translation?: string;
  textScale?: number;
  textWeight?: 'bold' | 'regular';
  align?: 'left' | 'center' | 'right';
}

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
        setTokens([{ text }]); // Fallback to treating the entire text as one token
      }
    };

    tokenizeText();
  }, [text, tokenizer, l2Lang]);

  return (
    <View style={[styles.container, { alignItems: align }]}>
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
  },
});
