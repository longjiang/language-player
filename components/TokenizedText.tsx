// @/components/TokenizedText.tsx

import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Token } from './Token';
import { Token as TokenType } from '@/src/tokenizer';
import { useDictionary } from '@/contexts/DictionaryContext';
import { useLanguage } from '@/contexts/LanguageContext';

export interface TokenizedTextProps {
  text: string;
  translation?: string;
  textScale?: number;
  textWeight?: "regular" | "bold";
  align?: 'left' | 'center' | 'right';
  onPopupOpen?: () => void;
  onPopupClose?: () => void;
}

export const TokenizedText: React.FC<TokenizedTextProps> = React.memo(({ 
  text, 
  translation, 
  textScale = 1, 
  textWeight, 
  align = 'left',
  onPopupOpen,
  onPopupClose
}) => {
  const [tokens, setTokens] = useState<TokenType[]>([]);
  const { tokenizer } = useDictionary();
  const { l2Lang } = useLanguage();
  if (!l2Lang) return null;
  
  const isRTL = l2Lang.direction === 'rtl';

  useEffect(() => {
    const tokenizeText = async () => {
      try {
        if (!tokenizer) {
          throw new Error('Tokenizer is not available');
        }
        const result = await tokenizer.tokenize(text, l2Lang);
        setTokens(result || []);
      } catch (error) {
        console.error('Tokenization error:', error);
        setTokens([{ text }]);
      }
    };

    tokenizeText();
  }, [text, tokenizer, l2Lang]);

  return (
    <View style={[
      styles.container, 
      { justifyContent: align === 'center' ? 'center' : isRTL ? 'flex-end' : 'flex-start' },
      isRTL ? styles.rtl : styles.ltr
    ]}>
      {tokens.map((token, index) => (
        <Token 
          key={index} 
          token={token} 
          textScale={textScale}
          textWeight={textWeight}
          context={text}
          translatedContext={translation}
          onPopupOpen={onPopupOpen}
          onPopupClose={onPopupClose}
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
  ltr: {
    flexDirection: 'row',
  },
  rtl: {
    flexDirection: 'row-reverse',
  },
});