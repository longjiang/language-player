import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Token } from './Token';
import { TokenData } from '@/src/tokenizer';
import { useDictionary } from '@/contexts/DictionaryContext';
import { useLanguage } from '@/contexts/LanguageContext';

// Define an interface for the props
interface TokenizedTextProps {
  text: string;
  translation?: string;
  textScale?: number;
  textWeight?: 'bold' | 'regular';
  align?: 'left' | 'center' | 'right';
}


export const TokenizedText: React.FC<TokenizedTextProps> = ({
  text,
  translation,
  textScale = 1,
  textWeight,
  align = "left"
}) => {

  const [tokens, setTokens] = useState<TokenData[]>([]);
  const { tokenizer } = useDictionary();
  const { l2Lang } = useLanguage();

  if (!tokenizer || !l2Lang) {
    console.error('Tokenizer or language is not available.');
    return null;
  }

  useEffect(() => {
    const fetchTokens = async () => {
      const tokens = await tokenizer.tokenize(text, l2Lang.code);
      setTokens(tokens || []);
    };
    fetchTokens();
  }, [text]);

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
      {tokens.map((token, index) => (
        <Token key={index} token={token} textScale={textScale} textWeight={textWeight} context={text} translatedContext={translation} />
      ))}
    </View>
  );
};
