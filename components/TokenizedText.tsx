import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View } from 'react-native';
import { Token } from './Token';
import { Token as TokenType } from '@/src/tokenizer';
import { useDictionary } from '@/contexts/DictionaryContext';
import { useLanguage } from '@/contexts/LanguageContext';

interface TokenizedTextProps {
  text: string;
  translation?: string;
  textScale?: number;
  textWeight?: 'bold' | 'regular';
  align?: 'left' | 'center' | 'right';
}

const TokenizedText: React.FC<TokenizedTextProps> = React.memo(({
  text,
  translation,
  textScale = 1,
  textWeight,
  align = "left"
}) => {
  const [tokens, setTokens] = useState<TokenType[]>([]);
  const { tokenizer } = useDictionary();
  const { l2Lang } = useLanguage();

  const fetchTokens = useCallback(async () => {
    if (!tokenizer || !l2Lang) {
      console.error('Tokenizer or language is not available.');
      return;
    }
    console.log('🍉 Fetching tokens:', text);
    const newTokens = await tokenizer.tokenize(text, l2Lang);
    console.log('🍈 Fetched:', text);
    setTokens(newTokens || []);
  }, [tokenizer, l2Lang, text]);

  useEffect(() => {
    fetchTokens();
  }, [fetchTokens]);

  const containerStyle = useMemo(() => ({
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    alignItems: 'flex-end' as const,
    justifyContent: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start'
  }), [align]);

  const memoizedTokens = useMemo(() => {
    console.log('Memoizing tokens:', text); // Added console log
    return tokens.map((token, index) => (
      <Token 
        key={`${token.value}-${index}`}
        token={token} 
        textScale={textScale} 
        textWeight={textWeight} 
        context={text} 
        translatedContext={translation} 
      />
    ));
  }, [tokens, textScale, textWeight, text, translation]);

  if (!tokenizer || !l2Lang) {
    return null;
  }

  console.log('Rendering TokenizedText:', text); // This log was already present
  return (
    <View style={containerStyle}>
      {console.log('Rendering tokens:', text) /* This is called every time updateCurrentTime is called every 200ms */}
      {memoizedTokens}
    </View>
  );
});

export { TokenizedText };