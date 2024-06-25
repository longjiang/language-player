import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Token } from './Token';

export const TokenizedText = ({ text, translation, textScale, textWeight, align = "left" }) => {
  const [tokens, setTokens] = useState([]);

  useEffect(() => {
    const tokenizeText = async () => {
      try {
        const response = await fetch(`https://pythonvps.zerotohero.ca/lemmatize-chinese?text=${encodeURIComponent(text)}`);
        const data = await response.json();
        setTokens(data);
      } catch (error) {
        console.error('Error fetching tokens:', error);
      }
    };

    tokenizeText();
  }, [text]);

  return (
    <View style={{flexDirection: 'row', flexWrap: 'wrap', justifyContent: align }}>
      {tokens.map((token, index) => (
        <Token key={index} token={token} textScale={textScale} textWeight={textWeight} context={text} translatedContext={translation} />
      ))}
    </View>
  );
};

