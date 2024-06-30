import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Token } from './Token';
import { PYTHON_SERVER } from '@/src/api/python';
import { tokenize, TokenData } from '@/src/tokenizer';

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

  useEffect(() => {
    const fetchTokens = async () => {
      const tokens = await tokenize(text);
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
