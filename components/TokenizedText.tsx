import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Token } from './Token';
import { PYTHON_SERVER } from '@/src/api/python';

// Define an interface for the props
interface TokenizedTextProps {
  text: string;
  translation: string;
  textScale: number;
  textWeight?: 'bold' | 'regular';
  align?: 'left' | 'center' | 'right';
}

// Define an interface for the token structure, adjust according to actual data structure
interface TokenData {
  // Example properties, modify according to the actual structure you expect
  word?: string;
  pronunciation?: string;
}

export const TokenizedText: React.FC<TokenizedTextProps> = ({
  text,
  translation,
  textScale,
  textWeight,
  align = "left"
}) => {
  const [tokens, setTokens] = useState<TokenData[]>([]);

  useEffect(() => {
    const tokenizeText = async () => {
      try {
        const response = await fetch(`${PYTHON_SERVER}/lemmatize-chinese?text=${encodeURIComponent(text)}`);
        const data: TokenData[] = await response.json();
        setTokens(data);
      } catch (error) {
        console.error('Error fetching tokens:', error);
      }
    };

    tokenizeText();
  }, [text]);

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
      {tokens.map((token, index) => (
        <Token key={index} token={token} textScale={textScale} textWeight={textWeight} context={text} translatedContext={translation} />
      ))}
    </View>
  );
};
